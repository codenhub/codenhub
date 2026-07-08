import type { NormalizedToastOptions } from "./options";
import { buildInlineStyle } from "./tokens";
import type { ToastIcon, ToastPosition } from "./types";

type ToastElementOptions = Pick<
  NormalizedToastOptions,
  "content" | "icon" | "isDismissable" | "message" | "role" | "rootClassName" | "tokens" | "instanceId"
>;

const POSITION_CONTAINER_CLASSES: Record<ToastPosition, string> = {
  "top-left": "fixed top-4 left-4 z-50 flex flex-col-reverse gap-2 pointer-events-none",
  "top-right": "fixed top-4 right-4 z-50 flex flex-col-reverse gap-2 pointer-events-none",
  "bottom-right": "fixed right-4 bottom-4 z-50 flex flex-col gap-2 pointer-events-none",
  "bottom-left": "fixed bottom-4 left-4 z-50 flex flex-col gap-2 pointer-events-none",
};

const ANIMATION_OPTIONS: KeyframeAnimationOptions = {
  duration: 400,
  easing: "ease-in-out",
  fill: "both",
};

const TOAST_ICON_HTML: Record<ToastIcon, string> = {
  success: '<i class="ic-success size-5 shrink-0" aria-hidden="true" />',
  error: '<i class="ic-error size-5 shrink-0" aria-hidden="true" />',
  warning: '<i class="ic-warning size-5 shrink-0" aria-hidden="true" />',
  info: '<i class="ic-info size-5 shrink-0" aria-hidden="true" />',
  loader: '<i class="ic-loader size-5 shrink-0 animate-spin" aria-hidden="true" />',
};

function createDismissButton(onDismiss: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className =
    "ml-auto -mr-1 inline-flex size-4 items-center justify-center rounded-full cursor-pointer shrink-0 opacity-70 transition-opacity duration-200 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current";
  button.innerHTML = '<i class="ic-close" />';
  button.setAttribute("aria-label", "Dismiss toast");
  button.addEventListener("click", onDismiss);
  return button;
}

function createIcon(icon: ToastIcon): Element {
  const template = document.createElement("template");
  template.innerHTML = TOAST_ICON_HTML[icon];

  const element = template.content.firstElementChild;
  if (element === null) {
    throw new Error(`Toast icon "${icon}" could not be rendered.`);
  }

  return element;
}

export function createToastElement(options: ToastElementOptions, onDismiss: () => void): HTMLDivElement {
  const ariaLive = options.role === "alert" ? "assertive" : "polite";
  const container = document.createElement("div");

  container.className = options.rootClassName;
  // Store the base class for update() to reference later
  container.setAttribute("data-root-class", options.rootClassName);
  container.setAttribute("data-toast-instance", options.instanceId);
  container.setAttribute("role", options.role);
  container.setAttribute("aria-live", ariaLive);
  container.setAttribute("aria-atomic", "true");

  if (options.content !== null) {
    container.append(...options.content);
  } else if (options.message !== null) {
    if (options.icon !== null) {
      container.appendChild(createIcon(options.icon));
    }

    const messageSpan = document.createElement("span");
    messageSpan.textContent = options.message;
    container.appendChild(messageSpan);
  }

  if (options.isDismissable) {
    container.appendChild(createDismissButton(onDismiss));
  }

  const inlineStyle = buildInlineStyle(options.tokens);
  if (inlineStyle) {
    container.style.cssText = inlineStyle;
  }

  return container;
}

// --- Container management (now accepts a configurable parent) ----------------

function getContainerKey(parentId: string, position: ToastPosition): string {
  return `toast-container-${parentId}-${position}`;
}

export function getContainer(parent: HTMLElement, position: ToastPosition): HTMLDivElement | null {
  const id = getContainerKey(parent.id || "body", position);
  return parent.querySelector(`[data-toast-container="${id}"]`) as HTMLDivElement | null;
}

export function getOrCreateContainer(parent: HTMLElement, position: ToastPosition): HTMLDivElement {
  let container = getContainer(parent, position);

  if (!container) {
    const id = getContainerKey(parent.id || "body", position);
    container = document.createElement("div");
    container.setAttribute("data-toast-container", id);
    container.className = POSITION_CONTAINER_CLASSES[position];
    parent.appendChild(container);
  }

  return container;
}

export function removeAllContainers(parent: HTMLElement): void {
  parent.querySelectorAll("[data-toast-container]").forEach((el) => el.remove());
}

// --- Animation helpers -------------------------------------------------------

function getKeyframes(position: ToastPosition): Keyframe[] {
  const isRight = position === "top-right" || position === "bottom-right";
  const start = isRight ? "translateX(100%)" : "translateX(-100%)";
  return [
    { transform: start, opacity: 0 },
    { transform: "translateX(0)", opacity: 1 },
  ];
}

function createSingleRunCallback(callback?: () => void): (() => void) | undefined {
  if (!callback) {
    return undefined;
  }
  let hasRun = false;
  return () => {
    if (hasRun) {
      return;
    }
    hasRun = true;
    callback();
  };
}

function runAnimation(
  element: HTMLDivElement,
  keyframes: Keyframe[],
  onFinish?: () => void,
  completeOnCancel = false,
): void {
  const finish = createSingleRunCallback(onFinish);

  if (!finish) {
    try {
      element.animate(keyframes, ANIMATION_OPTIONS);
    } catch {
      // Animation support unavailable, nothing pending.
    }
    return;
  }

  if (typeof element.animate !== "function") {
    finish();
    return;
  }

  try {
    const animation = element.animate(keyframes, ANIMATION_OPTIONS);
    animation.onfinish = finish;
    if (completeOnCancel) {
      animation.oncancel = finish;
    }
  } catch {
    finish();
  }
}

export function animateIn(element: HTMLDivElement, position: ToastPosition, onFinish?: () => void): void {
  runAnimation(element, getKeyframes(position), onFinish);
}

export function animateOut(element: HTMLDivElement, position: ToastPosition, onComplete: () => void): void {
  runAnimation(element, [...getKeyframes(position)].reverse(), onComplete, true);
}

export function animateStackChange(container: HTMLDivElement, updateStack: () => void): void {
  const previousRects = new Map<HTMLDivElement, DOMRect>();
  let stackOffset = 0;

  Array.from(container.children).forEach((child) => {
    if (child instanceof HTMLDivElement) {
      previousRects.set(child, child.getBoundingClientRect());
    }
  });

  updateStack();

  previousRects.forEach((previousRect, child) => {
    if (!container.contains(child)) {
      return;
    }

    const nextRect = child.getBoundingClientRect();
    const deltaY = previousRect.top - nextRect.top;

    if (deltaY === 0) {
      return;
    }

    stackOffset = deltaY;
    runAnimation(child, [{ translate: `0 ${deltaY}px` }, { translate: "0 0" }]);
  });

  if (stackOffset === 0) {
    return;
  }

  Array.from(container.children).forEach((child) => {
    if (!(child instanceof HTMLDivElement) || previousRects.has(child)) {
      return;
    }
    runAnimation(child, [{ translate: `0 ${stackOffset}px` }, { translate: "0 0" }]);
  });
}
