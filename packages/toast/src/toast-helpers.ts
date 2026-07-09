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
  instanceId: string;
  onComplete: () => void;
}

export function removeToastElement(params: RemoveToastElementParams): void {
  const { element, parent, position, instanceId, onComplete } = params;
  const container = parent.querySelector(
    `[data-toast-container="toast-container-${instanceId}-${parent.id || "body"}-${position}"]`,
  ) as HTMLDivElement | null;
  if (!container || !container.contains(element)) {
    onComplete();
    return;
  }
  if (dismissingElements.has(element)) {
    onComplete();
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
  instanceId: string;
  maxVisible: number;
  onAvailable: () => void;
}

export function requestSlot(params: RequestSlotParams): (() => void) | null {
  const { parent, position, instanceId, maxVisible, onAvailable } = params;
  const container = parent.querySelector(
    `[data-toast-container="toast-container-${instanceId}-${parent.id || "body"}-${position}"]`,
  ) as HTMLDivElement | null;
  if (!container) {
    return null;
  }

  const activeChildren = Array.from(container.children).filter(
    (child): child is HTMLDivElement => child instanceof HTMLDivElement && !dismissingElements.has(child),
  );

  if (activeChildren.length < maxVisible) {
    return null;
  }

  const oldestElement = activeChildren[0];
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

  removeToastElement({ element: oldestElement, parent, position, instanceId, onComplete: releaseSlot });
  return () => {
    isCanceled = true;
  };
}
