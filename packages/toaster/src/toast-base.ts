import { announce } from "./announcer";
import {
  animateIn,
  applyRootClassChange,
  captureStackRects,
  createToastShell,
  getOrCreateContainer,
  getToastAnnouncementText,
  isTopAnchoredPosition,
  playStackShift,
  populateToastContent,
  updateToastIcon,
} from "./dom";
import {
  SEMANTIC_ICONS,
  SEMANTIC_ROLES,
  SEMANTIC_ROOT_CLASS_NAMES,
  applyClassNameUpdate,
  assertDuration,
  assertSemanticType,
  hasNonEmptyString,
  normalizeToastOptions,
  resolveToastContent,
} from "./options";
import type { NormalizedToastOptions, RawToastOptions, ResolvedToastConfig, ToastPresetOptions } from "./options";
import { releaseSlot, removeToastElement, requestSlot, retryQueue, toastByElement } from "./toast-helpers";
import type {
  SemanticType,
  ToastAction,
  ToastHandle,
  ToastIcon,
  ToastLifecycleSubscriber,
  ToastRole,
  ToastState,
  ToastUpdateOptions,
} from "./types";

/** `Toast.update()`'s fields, resolved and validated once up front so applying them is infallible. */
interface NormalizedUpdate {
  title?: string | null;
  message?: string | null;
  description?: string | null;
  action?: ToastAction | null;
  content?: readonly Node[];
  icon?: ToastIcon | null;
  type?: SemanticType | "default";
  duration?: number;
  autoDismiss?: boolean;
  dismissible?: boolean;
  className?: string;
}

/** Reports an error with no caller to propagate to, the same way a browser reports an unhandled rejection. */
export function reportUncaughtError(error: unknown): void {
  const globalWithReportError = globalThis as typeof globalThis & {
    reportError?: (error: unknown) => void;
  };
  if (globalWithReportError.reportError) {
    globalWithReportError.reportError(error);
  } else {
    queueMicrotask(() => {
      throw error;
    });
  }
}

/** An update's text field: unchanged when omitted, cleared when empty. */
function normalizeUpdateText(value: string | null | undefined): string | null | undefined {
  return value === undefined ? undefined : hasNonEmptyString(value) ? value : null;
}

type ToastLifecycleEventName = "show" | "shown" | "hide" | "hidden";

type InternalToastState = "idle" | "queued" | "visible" | "hiding" | "done";

function convertToPublicState(internal: InternalToastState): ToastState {
  if (internal === "visible" || internal === "queued" || internal === "hiding") {
    return internal;
  }
  return "hidden";
}

function createLifecycleSubscribers(): Record<ToastLifecycleEventName, Set<ToastLifecycleSubscriber>> {
  return {
    show: new Set(),
    shown: new Set(),
    hide: new Set(),
    hidden: new Set(),
  };
}

/**
 * Base Toast class representing a single active or queued notification element.
 */
export class Toast {
  protected readonly options: Readonly<NormalizedToastOptions>;
  private readonly subscribers = createLifecycleSubscribers();
  private readonly reachedEvents = new Set<ToastLifecycleEventName>();
  private dismissTimeoutId: number | null = null;
  private dismissDeadline: number | null = null;
  private remainingDuration: number;
  private element: HTMLDivElement | null = null;
  private queuedSlotCancel: (() => void) | null = null;
  private internalState: InternalToastState = "idle";
  private isHovered = false;
  private isFocused = false;
  /** Whether render() has shown the shell but not yet filled it, while onShow subscribers run. */
  private isAwaitingContent = false;
  /** Deferred className from an `update()` call sent while still queued; message, content, icon, and type updates go through the `current*` fields below instead, applied automatically since `render()` reads them directly. */
  private pendingClassName: string | undefined;
  private currentIcon: ToastIcon | null;
  private currentRootClassName: string;
  private currentRole: ToastRole;
  private announcedText: string | null = null;
  private announcedRole: ToastRole | null = null;
  private currentAutoDismiss: boolean;
  private currentDismissible: boolean;
  private currentTitle: string | null;
  private currentMessage: string | null;
  private currentDescription: string | null;
  private currentAction: ToastAction | null;
  private currentContent: readonly Node[] | null;
  /** The in-flight entrance or exit `Animation`, if any -- canceled by `destroyImmediately()` instead of left to finish on its own. */
  private currentAnimation: Animation | null = null;
  /** Whether the owning document is currently in a background tab -- pauses auto-dismiss the same way hover/focus do, so time nobody could have read the toast doesn't count against its duration. */
  private isPageHidden = false;
  /** Detaches the document-level `visibilitychange` listener `render()` adds; unlike the hover/focus listeners above, it is not scoped to this toast's own element, so it needs an explicit removal once this toast settles. */
  private removeVisibilityListener: (() => void) | null = null;
  /** Whatever had focus immediately before this toast rendered, captured the same way `ModalController` captures its own restore target. Restored on removal only if focus is still (or again) inside this toast at that point -- see `shouldRestoreFocus`. */
  private restoreTarget: HTMLElement | null = null;
  /** Whether focus was inside this toast's element at the moment `hide()`/`destroyImmediately()` was called, captured before removal moves focus away on its own (typically to `<body>`) with nothing to undo that. */
  private shouldRestoreFocus = false;
  private readonly parent: HTMLElement;
  private readonly maxVisible: number;

  private settledResolve!: () => void;
  /**
   * A promise that resolves when the toast has completed its exit
   * animation and has been removed from the DOM.
   */
  public readonly settled: Promise<void>;
  public readonly handle: ToastHandle;

  protected static getPresetOptions(_options: unknown): ToastPresetOptions | null {
    return null;
  }

  /**
   * Constructs a new base Toast instance.
   *
   * @param params Parameter object containing options, config, and parent.
   */
  public constructor(params: { options: RawToastOptions; config: ResolvedToastConfig; parent: HTMLElement }) {
    const { options, config, parent } = params;
    this.parent = parent;
    this.maxVisible = config.maxVisible;
    const settledPromise = new Promise<void>((resolve) => {
      this.settledResolve = resolve;
    });
    this.settled = settledPromise;
    const getPublicState = () => convertToPublicState(this.internalState);
    this.handle = {
      dismiss: () => this.hide(),
      update: (opts: ToastUpdateOptions) => this.update(opts),
      get settled(): Promise<void> {
        return settledPromise;
      },
      get state() {
        return getPublicState();
      },
      onShow: (sub) => this.subscribe("show", sub),
      onShown: (sub) => this.subscribe("shown", sub),
      onHide: (sub) => this.subscribe("hide", sub),
      onHidden: (sub) => this.subscribe("hidden", sub),
    };
    this.options = normalizeToastOptions({
      options,
      preset: (this.constructor as typeof Toast).getPresetOptions(options),
      config,
      documentRef: parent.ownerDocument,
      handle: this.handle,
    });
    this.remainingDuration = this.options.duration;
    this.currentIcon = this.options.icon;
    this.currentRootClassName = this.options.rootClassName;
    this.currentRole = this.options.role;
    this.currentAutoDismiss = this.options.autoDismiss;
    this.currentDismissible = this.options.dismissible;
    this.currentTitle = this.options.title;
    this.currentMessage = this.options.message;
    this.currentDescription = this.options.description;
    this.currentAction = this.options.action;
    this.currentContent = this.options.content;
  }

  /**
   * Whether overflow eviction must skip this toast: it is being actively
   * hovered or focused, or it is a loader representing ongoing work.
   */
  public get isProtected(): boolean {
    return this.isHovered || this.isFocused || this.currentIcon === "loader";
  }

  /**
   * Updates properties of a toast in place. Applied immediately when the
   * toast is visible; stored and applied on admission when it is still
   * queued, so an update sent before a slot opens is not silently
   * discarded. This is a no-op once the toast has settled.
   *
   * @param updateOpts Scoped updates to apply to the toast.
   * @throws {Error} If `updateOpts.duration` is not a finite number >= 0,
   *   `updateOpts.type` is not a recognized severity, or
   *   `updateOpts.content` resolves to nothing renderable.
   */
  public update(updateOpts: ToastUpdateOptions): void {
    if (this.internalState !== "queued" && (this.internalState !== "visible" || this.element === null)) {
      return;
    }

    const normalized = this.normalizeUpdate(updateOpts);
    const previousIcon = this.currentIcon;
    const previousRootClassName = this.currentRootClassName;
    const wasLoader = previousIcon === "loader";

    if (normalized.content !== undefined) {
      // Content and message/icon are mutually exclusive, the same rule
      // construction itself applies -- see normalizeToastOptions.
      this.currentContent = normalized.content;
      this.currentTitle = null;
      this.currentMessage = null;
      this.currentDescription = null;
      this.currentAction = null;
      this.currentIcon = null;
    } else {
      if (normalized.title !== undefined) {
        this.currentTitle = normalized.title;
        this.currentContent = null;
      }
      if (normalized.message !== undefined) {
        if (normalized.title === undefined && this.currentDescription === null && this.currentMessage === null) {
          this.currentTitle = null;
        }
        this.currentMessage = normalized.message;
        this.currentContent = null;
      }
      if (normalized.description !== undefined) {
        this.currentDescription = normalized.description;
        this.currentContent = null;
      }
      if (normalized.action !== undefined) {
        this.currentAction = normalized.action;
        this.currentContent = null;
      }
      // Custom content has no icon slot, the same rule construction applies.
      if (this.currentContent === null) {
        if (normalized.icon !== undefined) {
          this.currentIcon = normalized.icon;
        } else if (normalized.type !== undefined) {
          this.currentIcon = SEMANTIC_ICONS[normalized.type];
        }
      }
    }

    if (normalized.type !== undefined) {
      this.currentRootClassName = SEMANTIC_ROOT_CLASS_NAMES[normalized.type];
      this.currentRole = SEMANTIC_ROLES[normalized.type];
    }
    if (normalized.dismissible !== undefined) {
      this.currentDismissible = normalized.dismissible;
    }

    const transitionedFromLoader = wasLoader && this.currentIcon !== "loader";

    if (normalized.autoDismiss !== undefined) {
      this.currentAutoDismiss = normalized.autoDismiss;
    } else if (transitionedFromLoader) {
      this.currentAutoDismiss = true;
    }

    if (normalized.duration !== undefined) {
      this.remainingDuration = normalized.duration;
    } else if (transitionedFromLoader) {
      this.remainingDuration = this.options.duration;
    }

    if (this.internalState === "queued" || this.isAwaitingContent) {
      if (normalized.className !== undefined) {
        this.pendingClassName = normalized.className;
      }
      // Everything else above already lives in the `current*` fields render()
      // reads once this toast is admitted -- nothing further to defer.
      return;
    }

    this.applyVisibleUpdate(normalized, previousIcon, previousRootClassName, transitionedFromLoader);
  }

  /**
   * Validates and resolves every field of an `update()` call up front, the
   * same "validate everything before mutating anything" boundary the rest
   * of this package draws: a rejected update must not leave an earlier
   * field from the same call already applied.
   */
  private normalizeUpdate(update: ToastUpdateOptions): NormalizedUpdate {
    if (update.duration !== undefined) {
      assertDuration(update.duration);
    }
    if (update.type !== undefined) {
      assertSemanticType(update.type);
    }

    return {
      // The fields that need no resolving: action, icon, type, duration,
      // autoDismiss, dismissible, and className.
      ...update,
      title: normalizeUpdateText(update.title),
      message: normalizeUpdateText(update.message),
      description: normalizeUpdateText(update.description),
      content:
        update.content !== undefined
          ? resolveToastContent(update.content, this.parent.ownerDocument, this.handle)
          : undefined,
    };
  }

  /** Applies an already-normalized update to a currently-visible toast's live DOM element and, for duration/autoDismiss, its running timer. */
  private applyVisibleUpdate(
    normalized: NormalizedUpdate,
    previousIcon: ToastIcon | null,
    previousRootClassName: string,
    transitionedFromLoader: boolean,
  ): void {
    const element = this.element;
    if (element === null) {
      return;
    }

    const hasExistingStructuredDom = element.querySelector("[data-toast-content], [data-toast-action]") !== null;

    const willHaveStructuredContent =
      this.currentTitle !== null || this.currentDescription !== null || this.currentAction !== null;

    const touchesStructure =
      normalized.content !== undefined ||
      normalized.title !== undefined ||
      normalized.description !== undefined ||
      normalized.action !== undefined ||
      normalized.dismissible !== undefined;

    const needsFullContentRebuild = hasExistingStructuredDom || willHaveStructuredContent || touchesStructure;

    if (needsFullContentRebuild) {
      const keepsControls =
        normalized.content === undefined &&
        normalized.action === undefined &&
        normalized.dismissible === undefined &&
        this.currentContent === null;
      this.rebuildContent(element, keepsControls);
    } else {
      if (normalized.message !== undefined) {
        const messageEl = element.querySelector("[data-toast-message]");
        if (messageEl) {
          messageEl.textContent = normalized.message;
        }
      }
      if (this.currentIcon !== previousIcon) {
        updateToastIcon(element, this.currentIcon, this.parent.ownerDocument);
      }
    }

    if (normalized.type !== undefined && this.currentRootClassName !== previousRootClassName) {
      applyRootClassChange(element, previousRootClassName, this.currentRootClassName);
    }
    this.announceIfChanged(element);

    if (normalized.className !== undefined) {
      applyClassNameUpdate(element, normalized.className);
    }

    if (normalized.duration !== undefined || normalized.autoDismiss !== undefined || transitionedFromLoader) {
      this.restartAutoDismissIfShown();
    }
  }

  /**
   * Rebuilds a visible toast's content from its `current*` fields. With
   * `keepsControls`, only the text and icon are replaced, so the action and
   * dismiss buttons stay the same nodes and keep focus across an update such
   * as a progress message. Otherwise everything is replaced, and focus that
   * was inside moves to the matching new button, or is let go.
   */
  private rebuildContent(element: HTMLDivElement, keepsControls: boolean): void {
    const documentRef = this.parent.ownerDocument;
    const previousMain = element.querySelector(":scope > [data-toast-main]");
    if (keepsControls && previousMain) {
      const scratch = documentRef.createElement("div");
      populateToastContent(
        scratch,
        { ...this.contentOptions, action: null, dismissible: false },
        () => this.hide(),
        documentRef,
        this.handle,
      );
      previousMain.replaceWith(...scratch.childNodes);
      return;
    }

    const focused = documentRef.activeElement;
    const hadFocus = focused !== null && element.contains(focused);
    const focusedSelector = focused?.matches("[data-toast-action]")
      ? "[data-toast-action]"
      : focused?.matches(".coden-toast-dismiss")
        ? ".coden-toast-dismiss"
        : null;
    element.replaceChildren();
    populateToastContent(element, this.contentOptions, () => this.hide(), documentRef, this.handle);
    if (!hadFocus) {
      return;
    }
    const replacement =
      (focusedSelector === null ? null : element.querySelector<HTMLElement>(focusedSelector)) ??
      element.querySelector<HTMLElement>("[data-toast-action], .coden-toast-dismiss");
    if (replacement) {
      replacement.focus();
    } else {
      // Removing a focused node fires no focusout in every engine.
      this.handleFocusLeft();
    }
  }

  private handleFocusLeft(): void {
    this.isFocused = false;
    if (!this.isHovered) {
      this.resumeAutoDismiss();
    }
    this.retryQueueIfUnprotected();
  }

  /**
   * Restarts the auto-dismiss timer against the current duration/enabled
   * state after an update() changes either one. A no-op before "shown" (no
   * timer could be running yet -- render()'s own animateIn callback will
   * schedule it) and while hovered/focused (pauseAutoDismiss already owns
   * the timer in that state; resuming re-reads the updated fields itself).
   */
  private restartAutoDismissIfShown(): void {
    if (!this.reachedEvents.has("shown") || this.element === null || this.isHovered || this.isFocused) {
      return;
    }
    this.clearAutoDismiss();
    this.scheduleAutoDismiss(this.element);
  }

  /**
   * Schedules the toast to be rendered. If the active stack is full,
   * places it in a queue until a slot is made available.
   */
  public show(): void {
    if (this.internalState !== "idle") {
      return;
    }

    this.internalState = "queued";
    this.queuedSlotCancel = requestSlot({
      parent: this.parent,
      position: this.options.position,
      instanceId: this.options.instanceId,
      maxVisible: this.maxVisible,
      owner: this,
      onAvailable: () => {
        this.queuedSlotCancel = null;
        if (this.internalState !== "queued") {
          return;
        }
        this.render();
      },
    });

    if (this.queuedSlotCancel !== null) {
      return;
    }

    this.render();
  }

  /** `createToastShell`'s input, reading the mutable rootClassName field `update()` can change instead of the frozen construction-time baseline. */
  private get shellOptions(): Pick<
    NormalizedToastOptions,
    "className" | "instanceClassName" | "instanceId" | "rootClassName"
  > {
    return { ...this.options, rootClassName: this.currentRootClassName };
  }

  /**
   * Announces this toast's text through the instance's live regions, unless
   * the same text was already announced with the same role -- so an update
   * that only restyles the toast stays silent.
   */
  private announceIfChanged(element: HTMLDivElement): void {
    const text = getToastAnnouncementText(element);
    if (text === this.announcedText && this.currentRole === this.announcedRole) {
      return;
    }
    this.announcedText = text;
    this.announcedRole = this.currentRole;
    announce({
      parent: this.parent,
      instanceId: this.options.instanceId,
      role: this.currentRole,
      text,
    });
  }

  /** `populateToastContent`'s input, reading the mutable content/icon/message fields `update()` can change instead of the frozen construction-time baseline. */
  private get contentOptions(): Pick<
    NormalizedToastOptions,
    "action" | "content" | "description" | "dismissible" | "dismissLabel" | "icon" | "message" | "title"
  > {
    return {
      action: this.currentAction,
      content: this.currentContent,
      description: this.currentDescription,
      dismissible: this.currentDismissible,
      dismissLabel: this.options.dismissLabel,
      icon: this.currentIcon,
      message: this.currentMessage,
      title: this.currentTitle,
    };
  }

  private render(): void {
    if (this.internalState !== "queued") {
      return;
    }
    const position = this.options.position;
    const documentRef = this.parent.ownerDocument;
    // Captured the same way ModalController captures its own restore
    // target, and at the same point -- admission, not dispatch -- since a
    // toast that sat queued for a while should restore whatever had focus
    // when it actually appeared, not whatever had it back when it was
    // first requested.
    this.restoreTarget =
      documentRef.activeElement instanceof documentRef.defaultView!.HTMLElement
        ? (documentRef.activeElement as HTMLElement)
        : null;

    let element: HTMLDivElement;
    let container: HTMLDivElement;
    try {
      element = createToastShell(this.shellOptions, documentRef);
      container = getOrCreateContainer({
        parent: this.parent,
        position,
        instanceId: this.options.instanceId,
        margin: this.options.margin,
        regionLabel: this.options.regionLabel,
      });
    } catch (error) {
      this.failRender(null, error);
      return;
    }

    // Tracked regardless of autoDismiss: isProtected (below) treats
    // hover/focus as protection from eviction independently of auto-dismiss,
    // so a persistent toast still needs these to know it's being interacted
    // with. pauseAutoDismiss/resumeAutoDismiss are no-ops when there is no
    // auto-dismiss timer to begin with.
    element.addEventListener("mouseenter", () => {
      this.isHovered = true;
      this.pauseAutoDismiss();
    });
    element.addEventListener("mouseleave", () => {
      this.isHovered = false;
      if (!this.isFocused) {
        this.resumeAutoDismiss();
      }
      this.retryQueueIfUnprotected();
    });
    element.addEventListener("focusin", () => {
      this.isFocused = true;
      this.pauseAutoDismiss();
    });
    element.addEventListener("focusout", (event) => {
      // focusout bubbles from any descendant, unlike mouseleave: tabbing
      // between two focusable elements inside the same toast (e.g. a link
      // in custom content and the dismiss button) must not register as
      // leaving the toast entirely.
      const relatedTarget = (event as FocusEvent).relatedTarget;
      if (relatedTarget instanceof Node && element.contains(relatedTarget)) {
        return;
      }
      this.handleFocusLeft();
    });

    if (typeof documentRef.hidden === "boolean") {
      this.isPageHidden = documentRef.hidden;
      const handleVisibilityChange = () => {
        this.isPageHidden = documentRef.hidden;
        if (this.isPageHidden) {
          this.pauseAutoDismiss();
        } else {
          this.resumeAutoDismiss();
        }
      };
      documentRef.addEventListener("visibilitychange", handleVisibilityChange);
      this.removeVisibilityListener = () => documentRef.removeEventListener("visibilitychange", handleVisibilityChange);
    }

    this.element = element;
    this.internalState = "visible";
    toastByElement.set(element, this);

    // An update() from an onShow subscriber lands in the current* fields
    // that populateToastContent reads below, not in the still-empty shell.
    this.isAwaitingContent = true;
    try {
      this.notify("show");
    } finally {
      this.isAwaitingContent = false;
    }

    if (this.internalState !== "visible" || this.element !== element) {
      toastByElement.delete(element);
      return;
    }
    const shellRootClassName = element.getAttribute("data-root-class") ?? "";
    if (shellRootClassName !== this.currentRootClassName) {
      applyRootClassChange(element, shellRootClassName, this.currentRootClassName);
    }

    const isTopAnchored = isTopAnchoredPosition(position);
    // Existing siblings' positions are captured before insertion, but the
    // push animation itself is not played until after the shell has its
    // real content (below) -- measuring "next" position right after
    // inserting the still-empty shell would capture its much shorter empty
    // height, understating the push and letting the true, larger shift
    // happen later as an unanimated snap the clipping stack then cuts into.
    // A top-anchored stack inserts at the start rather than
    // appending -- see `isTopAnchoredPosition` -- so the newest toast still
    // renders immediately below the anchored edge without needing
    // `flex-direction: column-reverse` to get there.
    const previousStackRects = captureStackRects(container);
    if (isTopAnchored) {
      container.insertBefore(element, container.firstChild);
    } else {
      container.appendChild(element);
    }

    try {
      populateToastContent(element, this.contentOptions, () => this.hide(), documentRef, this.handle);
      if (this.pendingClassName !== undefined) {
        applyClassNameUpdate(element, this.pendingClassName);
        this.pendingClassName = undefined;
      }
    } catch (error) {
      this.failRender(element, error);
      return;
    }
    // Keeps the newly-inserted toast in view when the stack has overflowed
    // into its own scroll area (see the stack's max-height/overflow-y in
    // index.css): the toast just dispatched -- the one a consumer most
    // needs to see -- is always at the start for a top-anchored stack and
    // the end otherwise (see above), so scrolling to that same edge always
    // reveals it. Measured only now, after content population above, so
    // its final height (not the empty shell's) is what scrollHeight
    // reflects. Removal deliberately leaves scroll position alone instead,
    // so it doesn't fight a user who scrolled to read an older toast. This
    // must run before playStackShift: that call measures every existing
    // sibling's "next" position to compute the push, and that measurement
    // has to already reflect the final scroll offset -- changing scrollTop
    // again afterward, once those positions (and the animations built from
    // them) already exist, would shift an in-flight animation's rendered
    // position out from under it by however much the scroll offset moved.
    container.scrollTop = isTopAnchored ? 0 : container.scrollHeight;
    playStackShift(container, previousStackRects);
    this.announceIfChanged(element);

    // Declared ahead, because onFinish runs synchronously without animation.
    let entrance: Animation | null = null;
    entrance = animateIn({
      element,
      position,
      onFinish: () => {
        // A hide() during the entrance already replaced it with the exit
        // animation, which destroyImmediately() must still be able to cancel.
        if (this.currentAnimation === entrance) {
          this.currentAnimation = null;
        }
        if (this.internalState !== "visible" || this.element !== element) {
          return;
        }
        this.notify("shown");
        this.scheduleAutoDismiss(element);
      },
    });
    // Without an animation, onFinish already ran, and a subscriber may have
    // started the exit animation from it.
    if (entrance !== null) {
      this.currentAnimation = entrance;
    }
  }

  /**
   * Releases everything a failed render would otherwise leak: the reserved
   * stack slot (so queued work isn't starved by a toast that never
   * actually appeared) and any partial DOM, then settles the handle and
   * reports the error to whatever the environment's uncaught-error channel
   * is, since there is no caller here to propagate it to synchronously.
   */
  private failRender(element: HTMLDivElement | null, error: unknown): void {
    if (element) {
      toastByElement.delete(element);
      element.remove();
    }
    this.element = null;
    // Idempotent if "show" already fired (the populateToastContent failure
    // path notifies it before ever calling failRender): a subscriber added
    // after an early failure -- before createToastShell/getOrCreateContainer
    // even ran -- must still see the toast reach every lifecycle stage
    // instead of hanging forever waiting for "show".
    this.notify("show");
    this.notifyHideAndHidden();
    this.releaseSlotAndListener();
    this.settledResolve();
    reportUncaughtError(error);
  }

  /**
   * Dismisses the toast and triggers its exit animations.
   */
  public hide(): void {
    if (this.internalState === "queued") {
      this.clearQueuedShow();
      this.notifyHideAndHidden();
      this.settledResolve();
      return;
    }

    if (this.internalState !== "visible" || this.element === null) {
      return;
    }

    this.clearAutoDismiss();
    const element = this.element;
    // Captured now, before removal moves focus away on its own (typically
    // to <body>) with nothing left to undo that -- see finishHide().
    this.shouldRestoreFocus = element.contains(this.parent.ownerDocument.activeElement);

    this.internalState = "hiding";
    this.notify("hide");
    this.currentAnimation = removeToastElement({
      element,
      parent: this.parent,
      position: this.options.position,
      instanceId: this.options.instanceId,
      onComplete: () => {
        this.currentAnimation = null;
        this.finishHide(element);
      },
    });
  }

  /**
   * Settles this toast immediately and synchronously as part of tearing
   * down its whole toaster instance (see `ToastManager.destroy()`):
   * cancels any in-flight entrance or exit animation instead of waiting for
   * it, and resolves `settled` before this call returns, rather than
   * `hide()`'s normal animated dismissal (which the destroyed instance's
   * containers are removed out from under, leaving nothing left to see).
   * A no-op once already settled.
   */
  public destroyImmediately(): void {
    if (this.internalState === "idle" || this.internalState === "done") {
      return;
    }

    this.clearAutoDismiss();
    // Cancel only after every state field below is already at its terminal
    // value: canceling can synchronously invoke this same animation's own
    // finish/cancel handler (render()'s onFinish, or hide()'s onComplete),
    // and each one only guards against running twice by reading these same
    // fields -- reordering this would let entrance's onFinish see a
    // still-"visible" state and wrongly notify "shown" and schedule an
    // auto-dismiss timer on a toast that is being torn down right now.
    const animation = this.currentAnimation;
    this.currentAnimation = null;

    if (this.internalState === "queued") {
      this.clearQueuedShow();
      // Matches failRender's own reasoning: a subscriber must still see
      // every lifecycle stage instead of hanging forever waiting for one
      // that a queued toast, never rendered, never actually reached.
      this.notify("show");
      this.notifyHideAndHidden();
      this.settledResolve();
      animation?.cancel();
      return;
    }

    const shouldRestoreFocus = this.element !== null && this.element.contains(this.parent.ownerDocument.activeElement);
    if (this.element) {
      toastByElement.delete(this.element);
      this.element = null;
    }
    if (this.internalState !== "hiding") {
      this.internalState = "hiding";
      this.notify("hide");
    }
    this.internalState = "done";
    this.releaseSlotAndListener();
    if (shouldRestoreFocus && this.restoreTarget?.isConnected) {
      this.restoreTarget.focus();
    }
    this.notify("hidden");
    this.settledResolve();
    animation?.cancel();
  }

  /** Moves a toast that never finished rendering through its last two lifecycle stages. */
  private notifyHideAndHidden(): void {
    this.internalState = "hiding";
    this.notify("hide");
    this.internalState = "done";
    this.notify("hidden");
  }

  /** Frees this toast's stack slot, letting queued work in, and detaches its document listener. */
  private releaseSlotAndListener(): void {
    releaseSlot({
      owner: this,
      parent: this.parent,
      position: this.options.position,
      instanceId: this.options.instanceId,
    });
    this.removeVisibilityListener?.();
    this.removeVisibilityListener = null;
  }

  private clearAutoDismiss(): void {
    if (this.dismissTimeoutId === null) {
      return;
    }
    clearTimeout(this.dismissTimeoutId);
    this.dismissTimeoutId = null;
    this.dismissDeadline = null;
  }

  private pauseAutoDismiss(): void {
    if (this.dismissDeadline !== null) {
      this.remainingDuration = Math.max(0, this.dismissDeadline - Date.now());
    }
    this.clearAutoDismiss();
  }

  /**
   * Gives a queue stuck behind this toast a chance to progress once hover
   * and focus both release it -- eviction otherwise only re-runs on a new
   * dispatch, a settle, or configure(), so nothing would ever notice a
   * persistent toast becoming eligible again.
   */
  private retryQueueIfUnprotected(): void {
    if (this.isHovered || this.isFocused || this.internalState !== "visible") {
      return;
    }
    retryQueue({ parent: this.parent, position: this.options.position, instanceId: this.options.instanceId });
  }

  private clearQueuedShow(): void {
    if (this.queuedSlotCancel === null) {
      return;
    }
    this.queuedSlotCancel();
    this.queuedSlotCancel = null;
  }

  private finishHide(element: HTMLDivElement): void {
    // destroyImmediately() already settled it, and canceling the exit
    // animation calls back here.
    if (this.internalState === "done") {
      return;
    }
    toastByElement.delete(element);
    this.element = null;
    this.internalState = "done";
    this.releaseSlotAndListener();
    // Only focus the removal itself lost: focus the user or the app moved
    // elsewhere during the exit animation stays where it went.
    const activeElement = this.parent.ownerDocument.activeElement;
    const isFocusLost =
      activeElement === null || activeElement === this.parent.ownerDocument.body || element.contains(activeElement);
    if (this.shouldRestoreFocus && isFocusLost && this.restoreTarget?.isConnected) {
      this.restoreTarget.focus();
    }
    this.notify("hidden");
    this.settledResolve();
  }

  private notify(eventName: ToastLifecycleEventName): void {
    this.reachedEvents.add(eventName);
    const subscribers = Array.from(this.subscribers[eventName]);
    this.subscribers[eventName].clear();
    subscribers.forEach((subscriber) => this.callSubscriber(subscriber));
  }

  private scheduleAutoDismiss(element: HTMLDivElement): void {
    if (!this.currentAutoDismiss || this.isHovered || this.isFocused || this.isPageHidden) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    this.dismissDeadline = Date.now() + this.remainingDuration;
    this.dismissTimeoutId = window.setTimeout(() => {
      this.dismissTimeoutId = null;
      this.dismissDeadline = null;
      if (this.internalState !== "visible" || this.element !== element) {
        return;
      }
      this.hide();
    }, this.remainingDuration);
  }

  private resumeAutoDismiss(): void {
    // scheduleAutoDismiss() itself checks autoDismiss and hover, focus, and page visibility.
    if (this.internalState !== "visible" || this.element === null || !this.reachedEvents.has("shown")) {
      return;
    }
    this.scheduleAutoDismiss(this.element);
  }

  private subscribe(eventName: ToastLifecycleEventName, subscriber: ToastLifecycleSubscriber): () => void {
    if (this.reachedEvents.has(eventName)) {
      this.callSubscriber(subscriber);
      return () => {};
    }
    this.subscribers[eventName].add(subscriber);
    return () => {
      this.subscribers[eventName].delete(subscriber);
    };
  }

  private callSubscriber(subscriber: ToastLifecycleSubscriber): void {
    try {
      subscriber(this.handle);
    } catch (error) {
      reportUncaughtError(error);
    }
  }
}
