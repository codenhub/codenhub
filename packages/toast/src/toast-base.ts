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
type ToastLifecycleSubscriber = (toast: Toast) => void;
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

function removeToastElement(
  element: HTMLDivElement,
  parent: HTMLElement,
  position: ToastPosition,
  onComplete: () => void,
): void {
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

function requestSlot(
  parent: HTMLElement,
  position: ToastPosition,
  maxVisible: number,
  onAvailable: () => void,
): (() => void) | null {
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

  removeToastElement(oldestElement, parent, position, releaseSlot);
  return () => {
    isCanceled = true;
  };
}

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

  public constructor(options: RawToastOptions, config: ResolvedToastConfig, parent: HTMLElement) {
    this.parent = parent;
    this.maxVisible = config.maxVisible;
    this.options = normalizeToastOptions(options, (this.constructor as typeof Toast).getPresetOptions(options), config);
    this._settled = new Promise<void>((resolve) => {
      this.settledResolve = resolve;
    });
  }

  public get publicState(): ToastState {
    return toPublicState(this.internalState);
  }

  public get settled(): Promise<void> {
    return this._settled;
  }

  public onShow(subscriber: ToastLifecycleSubscriber): () => void {
    return this.subscribe("show", subscriber);
  }

  public onShown(subscriber: ToastLifecycleSubscriber): () => void {
    return this.subscribe("shown", subscriber);
  }

  public onHide(subscriber: ToastLifecycleSubscriber): () => void {
    return this.subscribe("hide", subscriber);
  }

  public onHidden(subscriber: ToastLifecycleSubscriber): () => void {
    return this.subscribe("hidden", subscriber);
  }

  public update(updateOpts: ToastUpdateOptions): void {
    if (this.internalState !== "visible" || this.element === null) {
      return;
    }
    applyUpdateToElement(this.element, updateOpts);
  }

  public show(): void {
    if (this.internalState !== "idle") {
      return;
    }

    const position = this.options.position;
    this.internalState = "queued";
    this.queuedSlotCancel = requestSlot(this.parent, position, this.maxVisible, () => {
      this.queuedSlotCancel = null;
      if (this.internalState !== "queued") {
        return;
      }
      this.internalState = "idle";
      this.show();
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
    removeToastElement(element, this.parent, position, () => this.finishHide(element));
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
    if (!this.options.autoDismiss) {
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
