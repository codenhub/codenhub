import {
  animateIn,
  applyRootClassChange,
  captureStackRects,
  createToastShell,
  getOrCreateContainer,
  isTopAnchoredPosition,
  playStackShift,
  populateToastContent,
  updateToastIcon,
} from "./dom";
import {
  SEMANTIC_ICONS,
  SEMANTIC_ROLES,
  SEMANTIC_ROOT_CLASS_NAMES,
  applyUpdateToElement,
  assertDuration,
  assertSemanticType,
  hasNonEmptyString,
  normalizeToastOptions,
  resolveToastContent,
} from "./options";
import type {
  LiveStyleUpdate,
  NormalizedToastOptions,
  RawToastOptions,
  ResolvedToastConfig,
  ToastPresetOptions,
} from "./options";
import { releaseSlot, removeToastElement, requestSlot, retryQueue, toastByElement } from "./toast-helpers";
import { assertValidTokens } from "./tokens";
import type {
  SemanticType,
  ToastAction,
  ToastHandle,
  ToastIcon,
  ToastLifecycleSubscriber,
  ToastPosition,
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
  tokens?: LiveStyleUpdate["tokens"];
  className?: string;
}

/** Reports an error with no caller to propagate to, the same way a browser reports an unhandled rejection. */
function reportUncaughtError(error: unknown): void {
  const globalWithReportError = globalThis as typeof globalThis & { reportError?: (error: unknown) => void };
  if (globalWithReportError.reportError) {
    globalWithReportError.reportError(error);
  } else {
    queueMicrotask(() => {
      throw error;
    });
  }
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
  private _handle: ToastHandle | null = null;
  private readonly reachedEvents = new Set<ToastLifecycleEventName>();
  private dismissTimeoutId: number | null = null;
  private dismissDeadline: number | null = null;
  private remainingDuration: number;
  private element: HTMLDivElement | null = null;
  private queuedSlotCancel: (() => void) | null = null;
  private internalState: InternalToastState = "idle";
  private visiblePosition: ToastPosition | null = null;
  private isHovered = false;
  private isFocused = false;
  /** Deferred tokens/className from an `update()` call sent while still queued; message, content, icon, and type updates go through the `current*` fields below instead, applied automatically since `render()` reads them directly. */
  private pendingStyleUpdate: LiveStyleUpdate | null = null;
  private currentIcon: ToastIcon | null;
  private currentRootClassName: string;
  private currentRole: ToastRole;
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
  private readonly _settled: Promise<void>;

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
    this._settled = new Promise<void>((resolve) => {
      this.settledResolve = resolve;
    });
    const settledPromise = this._settled;
    const getPublicState = () => this.publicState;
    this._handle = {
      dismiss: () => this.hide(),
      update: (opts: ToastUpdateOptions) => this.update(opts),
      get settled(): Promise<void> {
        return settledPromise;
      },
      get state() {
        return getPublicState();
      },
      onShow: (sub) => this.onShow(sub),
      onShown: (sub) => this.onShown(sub),
      onHide: (sub) => this.onHide(sub),
      onHidden: (sub) => this.onHidden(sub),
    };
    this.options = normalizeToastOptions({
      options,
      preset: (this.constructor as typeof Toast).getPresetOptions(options),
      config,
      documentRef: parent.ownerDocument,
      handle: this._handle,
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

  public setHandle(handle: ToastHandle): void {
    this._handle = handle;
  }

  public get handle(): ToastHandle {
    return this._handle!;
  }

  /**
   * Gets the public-facing lifecycle state of this toast.
   */
  public get publicState(): ToastState {
    return convertToPublicState(this.internalState);
  }

  /**
   * Whether overflow eviction must skip this toast: it is being actively
   * hovered or focused, or it is a loader representing ongoing work.
   */
  public get isProtected(): boolean {
    return this.isHovered || this.isFocused || this.currentIcon === "loader";
  }

  /**
   * A promise that resolves when the toast has completed its exit
   * animation and has been removed from the DOM.
   */
  public get settled(): Promise<void> {
    return this._settled;
  }

  /**
   * Registers a callback to trigger when the toast is initially requested to show.
   *
   * @param subscriber Callback subscriber function.
   * @returns Unsubscribe function.
   */
  public onShow(subscriber: ToastLifecycleSubscriber): () => void {
    return this.subscribe("show", subscriber);
  }

  /**
   * Registers a callback to trigger when the entrance animation completes.
   *
   * @param subscriber Callback subscriber function.
   * @returns Unsubscribe function.
   */
  public onShown(subscriber: ToastLifecycleSubscriber): () => void {
    return this.subscribe("shown", subscriber);
  }

  /**
   * Registers a callback to trigger when the toast begins to hide.
   *
   * @param subscriber Callback subscriber function.
   * @returns Unsubscribe function.
   */
  public onHide(subscriber: ToastLifecycleSubscriber): () => void {
    return this.subscribe("hide", subscriber);
  }

  /**
   * Registers a callback to trigger when the toast is fully removed from DOM.
   *
   * @param subscriber Callback subscriber function.
   * @returns Unsubscribe function.
   */
  public onHidden(subscriber: ToastLifecycleSubscriber): () => void {
    return this.subscribe("hidden", subscriber);
  }

  /**
   * Updates properties of a toast in place. Applied immediately when the
   * toast is visible; stored and applied on admission when it is still
   * queued, so an update sent before a slot opens is not silently
   * discarded. This is a no-op once the toast has settled.
   *
   * @param updateOpts Scoped updates to apply to the toast.
   * @throws {Error} If `updateOpts.tokens` contains an invalid CSS color,
   *   `updateOpts.duration` is not a finite number >= 0, `updateOpts.type`
   *   is not a recognized severity, or `updateOpts.content` resolves to
   *   nothing renderable (including a string emptied entirely by sanitization).
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
      if (normalized.icon !== undefined) {
        this.currentIcon = normalized.icon;
      } else if (normalized.type !== undefined) {
        this.currentIcon = SEMANTIC_ICONS[normalized.type];
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

    if (this.internalState === "queued") {
      if (normalized.tokens !== undefined || normalized.className !== undefined) {
        this.pendingStyleUpdate = {
          ...this.pendingStyleUpdate,
          ...(normalized.tokens !== undefined ? { tokens: normalized.tokens } : {}),
          ...(normalized.className !== undefined ? { className: normalized.className } : {}),
        };
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
    if (update.tokens !== undefined) {
      assertValidTokens(update.tokens, this.parent.ownerDocument);
    }
    if (update.duration !== undefined) {
      assertDuration(update.duration);
    }
    if (update.type !== undefined) {
      assertSemanticType(update.type);
    }

    const title = update.title !== undefined ? (hasNonEmptyString(update.title) ? update.title : null) : undefined;
    const message =
      update.message !== undefined ? (hasNonEmptyString(update.message) ? update.message : null) : undefined;
    const description =
      update.description !== undefined
        ? hasNonEmptyString(update.description)
          ? update.description
          : null
        : undefined;

    return {
      title,
      message,
      description,
      action: update.action,
      content:
        update.content !== undefined
          ? resolveToastContent(update.content, this.parent.ownerDocument, this.handle ?? undefined)
          : undefined,
      icon: update.icon,
      type: update.type,
      duration: update.duration,
      autoDismiss: update.autoDismiss,
      dismissible: update.dismissible ?? update.closeButton,
      // Snapshotted rather than referenced: the same boundary
      // normalizeToastOptions draws for construction-time tokens, so a
      // caller mutation after this call cannot change what gets applied.
      tokens: update.tokens ? { ...update.tokens } : update.tokens,
      className: update.className,
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

    const hasExistingStructuredDom =
      element.querySelector("[data-toast-content]") !== null || element.querySelector("[data-toast-action]") !== null;

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
      element.replaceChildren();
      populateToastContent(
        element,
        this.contentOptions,
        () => this.hide(),
        this.parent.ownerDocument,
        this.handle ?? undefined,
      );
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
      element.setAttribute("role", this.currentRole);
      element.setAttribute("aria-live", this.currentRole === "alert" ? "assertive" : "polite");
    }

    if (normalized.tokens !== undefined || normalized.className !== undefined) {
      applyUpdateToElement(element, { tokens: normalized.tokens, className: normalized.className });
    }

    if (normalized.duration !== undefined || normalized.autoDismiss !== undefined || transitionedFromLoader) {
      this.restartAutoDismissIfShown();
    }
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
    if (this.currentAutoDismiss) {
      this.scheduleAutoDismiss(this.element);
    }
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

  /** `createToastShell`'s input, reading the mutable role/rootClassName fields `update()` can change instead of the frozen construction-time baseline. */
  private get shellOptions(): Pick<
    NormalizedToastOptions,
    "className" | "instanceClassName" | "instanceId" | "role" | "rootClassName" | "tokens"
  > {
    return {
      className: this.options.className,
      instanceClassName: this.options.instanceClassName,
      instanceId: this.options.instanceId,
      role: this.currentRole,
      rootClassName: this.currentRootClassName,
      tokens: this.options.tokens,
    };
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
      element = createToastShell(this.shellOptions, this.parent.ownerDocument);
      container = getOrCreateContainer({
        parent: this.parent,
        position,
        instanceId: this.options.instanceId,
        margin: this.options.margin,
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
      this.isFocused = false;
      if (!this.isHovered) {
        this.resumeAutoDismiss();
      }
      this.retryQueueIfUnprotected();
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
    this.visiblePosition = position;
    toastByElement.set(element, this);

    this.notify("show");

    if (this.internalState !== "visible" || this.element !== element) {
      toastByElement.delete(element);
      return;
    }

    const isTopAnchored = isTopAnchoredPosition(position);
    // Existing siblings' positions are captured before insertion, but the
    // push animation itself is not played until after the shell has its
    // real content (below) -- measuring "next" position right after
    // inserting the still-empty shell would capture its much shorter empty
    // height, understating the push and letting the true, larger shift
    // happen later as an unanimated snap the clipping stack then cuts into.
    // The shell is still inserted empty first, then filled, since that is a
    // distinct mutation an assistive technology's live-region observer can
    // pick up -- see `createToastShell`'s own doc comment for why the order
    // matters. A top-anchored stack inserts at the start rather than
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
      populateToastContent(
        element,
        this.contentOptions,
        () => this.hide(),
        this.parent.ownerDocument,
        this.handle ?? undefined,
      );
      if (this.pendingStyleUpdate) {
        applyUpdateToElement(element, this.pendingStyleUpdate);
        this.pendingStyleUpdate = null;
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

    this.currentAnimation = animateIn({
      element,
      position,
      onFinish: () => {
        this.currentAnimation = null;
        if (this.internalState !== "visible" || this.element !== element) {
          return;
        }
        this.notify("shown");
        this.scheduleAutoDismiss(element);
      },
    });
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
    this.internalState = "hiding";
    this.notify("hide");
    this.internalState = "done";
    this.notify("hidden");
    this.removeVisibilityListener?.();
    this.removeVisibilityListener = null;
    releaseSlot({
      owner: this,
      parent: this.parent,
      position: this.options.position,
      instanceId: this.options.instanceId,
    });
    this.settledResolve();
    reportUncaughtError(error);
  }

  /**
   * Dismisses the toast and triggers its exit animations.
   */
  public hide(): void {
    if (this.internalState === "queued") {
      this.clearQueuedShow();
      this.internalState = "hiding";
      this.notify("hide");
      this.internalState = "done";
      this.notify("hidden");
      this.settledResolve();
      return;
    }

    if (this.internalState !== "visible" || this.element === null || this.visiblePosition === null) {
      return;
    }

    this.clearAutoDismiss();
    const element = this.element;
    const position = this.visiblePosition;
    // Captured now, before removal moves focus away on its own (typically
    // to <body>) with nothing left to undo that -- see finishHide().
    this.shouldRestoreFocus = element.contains(this.parent.ownerDocument.activeElement);

    this.internalState = "hiding";
    this.notify("hide");
    this.currentAnimation = removeToastElement({
      element,
      parent: this.parent,
      position,
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
      this.internalState = "hiding";
      this.notify("hide");
      this.internalState = "done";
      this.notify("hidden");
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
    this.visiblePosition = null;
    releaseSlot({
      owner: this,
      parent: this.parent,
      position: this.options.position,
      instanceId: this.options.instanceId,
    });
    this.removeVisibilityListener?.();
    this.removeVisibilityListener = null;
    if (shouldRestoreFocus && this.restoreTarget?.isConnected) {
      this.restoreTarget.focus();
    }
    this.notify("hidden");
    this.settledResolve();
    animation?.cancel();
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
    toastByElement.delete(element);
    this.element = null;
    this.internalState = "done";
    this.visiblePosition = null;
    releaseSlot({
      owner: this,
      parent: this.parent,
      position: this.options.position,
      instanceId: this.options.instanceId,
    });
    this.removeVisibilityListener?.();
    this.removeVisibilityListener = null;
    if (this.shouldRestoreFocus && this.restoreTarget?.isConnected) {
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
    if (
      !this.currentAutoDismiss ||
      this.internalState !== "visible" ||
      this.element === null ||
      !this.reachedEvents.has("shown")
    ) {
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
      if (this.handle) {
        subscriber(this.handle);
      }
    } catch (error) {
      reportUncaughtError(error);
    }
  }
}
