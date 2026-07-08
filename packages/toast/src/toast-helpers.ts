import { animateOut, animateStackChange } from "./dom";
import type { ToastPosition } from "./types";

export interface HideableToast {
  hide(): void;
  onHidden(subscriber: (toast: unknown) => void): () => void;
}

export const dismissingElements = new WeakSet<HTMLDivElement>();
export const toastByElement = new WeakMap<HTMLDivElement, HideableToast>();

export interface RemoveToastElementParams {
  element: HTMLDivElement;
  parent: HTMLElement;
  position: ToastPosition;
  onComplete: () => void;
}

export function removeToastElement(params: RemoveToastElementParams): void {
  const { element, parent, position, onComplete } = params;
  const container = parent.querySelector(
    `[data-toast-container="toast-container-${parent.id || "body"}-${position}"]`,
  ) as HTMLDivElement | null;
  if (!container || !container.contains(element)) {
    onComplete();
    return;
  }
  if (dismissingElements.has(element)) {
    return;
  }
  dismissingElements.add(element);

  animateOut({
    element,
    position,
    onComplete: () => {
      dismissingElements.delete(element);
      animateStackChange(container, () => {
        if (container.contains(element)) {
          container.removeChild(element);
        }
      });
      onComplete();
    },
  });
}

export interface RequestSlotParams {
  parent: HTMLElement;
  position: ToastPosition;
  maxVisible: number;
  onAvailable: () => void;
}

export function requestSlot(params: RequestSlotParams): (() => void) | null {
  const { parent, position, maxVisible, onAvailable } = params;
  const container = parent.querySelector(
    `[data-toast-container="toast-container-${parent.id || "body"}-${position}"]`,
  ) as HTMLDivElement | null;
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
