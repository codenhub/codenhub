import { animateIn, animateStackChange, createToastElement, getOrCreateContainer } from "./dom";
import { applyUpdateToElement, normalizeToastOptions } from "./options";
import type { NormalizedToastOptions, RawToastOptions, ResolvedToastConfig, ToastPresetOptions } from "./options";
import { releaseSlot, removeToastElement, requestSlot, toastByElement } from "./toast-helpers";
import type { ToastHandle, ToastLifecycleSubscriber, ToastPosition, ToastState, ToastUpdateOptions } from "./types";

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
  private handle: ToastHandle | null = null;
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
    this.options = normalizeToastOptions({
      options,
      preset: (this.constructor as typeof Toast).getPresetOptions(options),
      config,
      documentRef: parent.ownerDocument,
    });
    this.remainingDuration = this.options.duration;
    this._settled = new Promise<void>((resolve) => {
      this.settledResolve = resolve;
    });
  }

  /**
   * Connects the public ToastHandle instance to this toast.
   *
   * @param handle The public control handle.
   */
  public setHandle(handle: ToastHandle): void {
    this.handle = handle;
  }

  /**
   * Gets the public-facing lifecycle state of this toast.
   */
  public get publicState(): ToastState {
    return convertToPublicState(this.internalState);
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
   * Updates properties of a visible toast in place.
   * This is a no-op if the toast is not currently visible.
   *
   * @param updateOpts Scoped updates to apply to the toast element.
   */
  public update(updateOpts: ToastUpdateOptions): void {
    if (this.internalState !== "visible" || this.element === null) {
      return;
    }
    applyUpdateToElement(this.element, updateOpts);
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

  private render(): void {
    if (this.internalState !== "queued") {
      return;
    }
    const position = this.options.position;
    const element = createToastElement(this.options, () => this.hide(), this.parent.ownerDocument);

    if (this.options.shouldAutoDismiss) {
      element.addEventListener("mouseenter", () => {
        this.isHovered = true;
        this.pauseAutoDismiss();
      });
      element.addEventListener("mouseleave", () => {
        this.isHovered = false;
        if (!this.isFocused) {
          this.resumeAutoDismiss();
        }
      });
      element.addEventListener("focusin", () => {
        this.isFocused = true;
        this.pauseAutoDismiss();
      });
      element.addEventListener("focusout", () => {
        this.isFocused = false;
        if (!this.isHovered) {
          this.resumeAutoDismiss();
        }
      });
    }

    const container = getOrCreateContainer({
      parent: this.parent,
      position,
      instanceId: this.options.instanceId,
      margin: this.options.margin,
    });

    this.element = element;
    this.internalState = "visible";
    this.visiblePosition = position;
    toastByElement.set(element, this);

    this.notify("show");

    if (this.internalState !== "visible" || this.element !== element) {
      toastByElement.delete(element);
      return;
    }

    animateStackChange(container, () => {
      container.appendChild(element);
    });
    animateIn({
      element,
      position,
      onFinish: () => {
        if (this.internalState !== "visible" || this.element !== element) {
          return;
        }
        this.notify("shown");
        this.scheduleAutoDismiss(element);
      },
    });
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

    this.internalState = "hiding";
    this.notify("hide");
    removeToastElement({
      element,
      parent: this.parent,
      position,
      instanceId: this.options.instanceId,
      onComplete: () => this.finishHide(element),
    });
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
    if (!this.options.shouldAutoDismiss || this.isHovered || this.isFocused) {
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
      !this.options.shouldAutoDismiss ||
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
      const globalWithReportError = globalThis as typeof globalThis & { reportError?: (error: unknown) => void };
      if (globalWithReportError.reportError) {
        globalWithReportError.reportError(error);
      } else {
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }
}
