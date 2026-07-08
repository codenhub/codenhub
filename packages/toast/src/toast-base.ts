import {
  animateIn,
  animateOut,
  animateStackChange,
  createToastElement,
  getContainer,
  getOrCreateContainer,
} from "./dom";
import {
  applyUpdateToElement,
  normalizeToastOptions,
  type NormalizedToastOptions,
  type RawToastOptions,
  type ResolvedToastConfig,
  type ToastPresetOptions,
} from "./options";
import type { ToastPosition, ToastState, ToastUpdateOptions } from "./types";

type ToastLifecycleEventName = "show" | "shown" | "hide" | "hidden";

/**
 * Subscriber callback function signature for toast lifecycle events.
 */
export type ToastLifecycleSubscriber = (toast: Toast) => void;

type InternalToastState = "idle" | "queued" | "visible" | "hiding" | "done";

function toPublicState(internal: InternalToastState): ToastState {
  if (internal === "visible" || internal === "queued") {
    return "visible";
  }
  if (internal === "hiding") {
    return "hiding";
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

const dismissingElements = new WeakSet<HTMLDivElement>();
const toastByElement = new WeakMap<HTMLDivElement, Toast>();

interface RemoveToastElementParams {
  element: HTMLDivElement;
  parent: HTMLElement;
  position: ToastPosition;
  onComplete: () => void;
}

function removeToastElement(params: RemoveToastElementParams): void {
  const { element, parent, position, onComplete } = params;
  const container = getContainer(parent, position);
  if (!container || !container.contains(element)) {
    onComplete();
    return;
  }
  if (dismissingElements.has(element)) {
    return;
  }
  dismissingElements.add(element);

  animateOut(element, position, () => {
    dismissingElements.delete(element);
    animateStackChange(container, () => {
      if (container.contains(element)) {
        container.removeChild(element);
      }
    });
    onComplete();
  });
}

interface RequestSlotParams {
  parent: HTMLElement;
  position: ToastPosition;
  maxVisible: number;
  onAvailable: () => void;
}

function requestSlot(params: RequestSlotParams): (() => void) | null {
  const { parent, position, maxVisible, onAvailable } = params;
  const container = getContainer(parent, position);
  if (!container || container.children.length < maxVisible) {
    return null;
  }
  const oldestElement = container.firstElementChild as HTMLDivElement | null;
  if (!oldestElement) {
    return null;
  }

  let isCanceled = false;
  const releaseSlot = (): void => {
    if (!isCanceled) {
      onAvailable();
    }
  };

  const ownerToast = toastByElement.get(oldestElement);
  if (ownerToast) {
    const unsubscribe = ownerToast.onHidden(releaseSlot);
    ownerToast.hide();
    return () => {
      isCanceled = true;
      unsubscribe();
    };
  }

  removeToastElement({ element: oldestElement, parent, position, onComplete: releaseSlot });
  return () => {
    isCanceled = true;
  };
}

/**
 * Base Toast class representing a single active or queued notification element.
 */
export class Toast {
  protected readonly options: Readonly<NormalizedToastOptions>;
  private readonly subscribers = createLifecycleSubscribers();
  private dismissTimeoutId: number | null = null;
  private element: HTMLDivElement | null = null;
  private queuedSlotCancel: (() => void) | null = null;
  private internalState: InternalToastState = "idle";
  private visiblePosition: ToastPosition | null = null;
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
   * @param options Raw user-provided notification options.
   * @param config The resolved configuration of the parent toaster.
   * @param parent The DOM container element where the stack container lives.
   */
  public constructor(options: RawToastOptions, config: ResolvedToastConfig, parent: HTMLElement) {
    this.parent = parent;
    this.maxVisible = config.maxVisible;
    this.options = normalizeToastOptions({
      options,
      preset: (this.constructor as typeof Toast).getPresetOptions(options),
      config,
    });
    this._settled = new Promise<void>((resolve) => {
      this.settledResolve = resolve;
    });
  }

  /**
   * Gets the public-facing lifecycle state of this toast.
   */
  public get publicState(): ToastState {
    return toPublicState(this.internalState);
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

    const position = this.options.position;
    this.internalState = "queued";
    this.queuedSlotCancel = requestSlot({
      parent: this.parent,
      position,
      maxVisible: this.maxVisible,
      onAvailable: () => {
        this.queuedSlotCancel = null;
        if (this.internalState !== "queued") {
          return;
        }
        this.internalState = "idle";
        this.show();
      },
    });

    if (this.queuedSlotCancel !== null) {
      return;
    }

    const element = createToastElement(this.options, () => this.hide());
    const container = getOrCreateContainer(this.parent, position);

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
    animateIn(element, position, () => {
      if (this.internalState !== "visible" || this.element !== element) {
        return;
      }
      this.notify("shown");
      this.scheduleAutoDismiss(element);
    });
  }

  /**
   * Dismisses the toast and triggers its exit animations.
   */
  public hide(): void {
    if (this.internalState === "queued") {
      this.clearQueuedShow();
      this.internalState = "done";
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
      onComplete: () => this.finishHide(element),
    });
  }

  private clearAutoDismiss(): void {
    if (this.dismissTimeoutId === null) {
      return;
    }
    clearTimeout(this.dismissTimeoutId);
    this.dismissTimeoutId = null;
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
    this.notify("hidden");
    this.settledResolve();
  }

  private notify(eventName: ToastLifecycleEventName): void {
    this.subscribers[eventName].forEach((subscriber) => subscriber(this));
  }

  private scheduleAutoDismiss(element: HTMLDivElement): void {
    if (!this.options.shouldAutoDismiss) {
      return;
    }
    this.dismissTimeoutId = window.setTimeout(() => {
      if (this.internalState !== "visible" || this.element !== element) {
        return;
      }
      this.hide();
    }, this.options.duration);
  }

  private subscribe(eventName: ToastLifecycleEventName, subscriber: ToastLifecycleSubscriber): () => void {
    this.subscribers[eventName].add(subscriber);
    return () => {
      this.subscribers[eventName].delete(subscriber);
    };
  }
}
