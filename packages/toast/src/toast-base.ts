import {
  animateIn,
  animateOut,
  animateStackChange,
  createToastElement,
  getContainer,
  getOrCreateContainer,
} from "./dom";
import { normalizeToastOptions, type NormalizedToastOptions, type ToastPresetOptions } from "./options";
import type { ToastOptions, ToastPosition } from "./types";

type ToastLifecycleEventName = "show" | "shown" | "hide" | "hidden";
type ToastLifecycleSubscriber = (toast: Toast) => void;
type ToastState = "idle" | "queued" | "visible" | "hiding";

const MAX_VISIBLE_TOASTS = 5;
const dismissingElements = new WeakSet<HTMLDivElement>();
const toastByElement = new WeakMap<HTMLDivElement, Toast>();

function createLifecycleSubscribers(): Record<ToastLifecycleEventName, Set<ToastLifecycleSubscriber>> {
  return {
    show: new Set(),
    shown: new Set(),
    hide: new Set(),
    hidden: new Set(),
  };
}

function removeToastElement(element: HTMLDivElement, position: ToastPosition, onComplete: () => void): void {
  const container = getContainer(position);
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

function requestSlot(position: ToastPosition, onAvailable: () => void): (() => void) | null {
  const container = getContainer(position);
  if (!container || container.children.length < MAX_VISIBLE_TOASTS) {
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

  removeToastElement(oldestElement, position, releaseSlot);
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
  private state: ToastState = "idle";
  private visiblePosition: ToastPosition | null = null;

  protected static getPresetOptions(_options: unknown): ToastPresetOptions | null {
    return null;
  }

  public constructor(options: ToastOptions) {
    this.options = normalizeToastOptions(options, (this.constructor as typeof Toast).getPresetOptions(options));
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

  public show(): void {
    if (this.state !== "idle") {
      return;
    }

    const position = this.options.position;
    this.state = "queued";
    this.queuedSlotCancel = requestSlot(position, () => {
      this.queuedSlotCancel = null;
      if (this.state !== "queued") {
        return;
      }
      this.state = "idle";
      this.show();
    });

    if (this.queuedSlotCancel !== null) {
      return;
    }

    const element = createToastElement(this.options, () => this.hide());
    const container = getOrCreateContainer(position);

    this.element = element;
    this.state = "visible";
    this.visiblePosition = position;
    toastByElement.set(element, this);

    this.notify("show");

    if (this.state !== "visible" || this.element !== element) {
      toastByElement.delete(element);
      return;
    }

    animateStackChange(container, () => {
      container.appendChild(element);
    });
    animateIn(element, position, () => {
      if (this.state !== "visible" || this.element !== element) {
        return;
      }
      this.notify("shown");
      this.scheduleAutoDismiss(element);
    });
  }

  public hide(): void {
    if (this.state === "queued") {
      this.clearQueuedShow();
      this.state = "idle";
      return;
    }

    if (this.state !== "visible" || this.element === null || this.visiblePosition === null) {
      return;
    }

    this.clearAutoDismiss();
    const element = this.element;
    const position = this.visiblePosition;

    this.state = "hiding";
    this.notify("hide");
    removeToastElement(element, position, () => this.finishHide(element));
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
    this.state = "idle";
    this.visiblePosition = null;
    this.notify("hidden");
  }

  private notify(eventName: ToastLifecycleEventName): void {
    this.subscribers[eventName].forEach((subscriber) => {
      subscriber(this);
    });
  }

  private scheduleAutoDismiss(element: HTMLDivElement): void {
    if (!this.options.autoDismiss) {
      return;
    }
    this.dismissTimeoutId = window.setTimeout(() => {
      if (this.state !== "visible" || this.element !== element) {
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
