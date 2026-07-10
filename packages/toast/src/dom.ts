import type { NormalizedToastOptions } from "./options";
import { applyTokens } from "./tokens";
import type { ToastIcon, ToastPosition } from "./types";

type ToastElementOptions = Pick<
  NormalizedToastOptions,
  "content" | "icon" | "isDismissable" | "message" | "role" | "rootClassName" | "className" | "tokens" | "instanceId"
>;

const POSITION_CONTAINER_CLASSES: Record<ToastPosition, string> = {
  "top-left": "coden-toast-stack coden-toast-stack-top-left",
  "top-right": "coden-toast-stack coden-toast-stack-top-right",
  "bottom-right": "coden-toast-stack coden-toast-stack-bottom-right",
  "bottom-left": "coden-toast-stack coden-toast-stack-bottom-left",
  "top-center": "coden-toast-stack coden-toast-stack-top-center",
  "bottom-center": "coden-toast-stack coden-toast-stack-bottom-center",
  center: "coden-toast-stack coden-toast-stack-center",
};

const ANIMATION_OPTIONS: KeyframeAnimationOptions = {
  duration: 400,
  easing: "ease-in-out",
  fill: "both",
};

const SVG_SUCCESS =
  '<svg class="coden-toast-icon" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></svg>';

const SVG_ERROR =
  '<svg class="coden-toast-icon" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></svg>';

const SVG_WARNING =
  '<svg class="coden-toast-icon" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>';

const SVG_INFO =
  '<svg class="coden-toast-icon" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>';

const SVG_LOADER =
  '<svg class="coden-toast-icon coden-toast-spinner" aria-hidden="true" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9.5" fill="none" stroke-width="3" stroke-linecap="round" stroke-dasharray="42 150"></circle></svg>';

const SVG_CLOSE =
  '<svg aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>';

const TOAST_ICON_HTML: Record<ToastIcon, string> = {
  success: SVG_SUCCESS,
  error: SVG_ERROR,
  warning: SVG_WARNING,
  info: SVG_INFO,
  loader: SVG_LOADER,
};

function parseSVGString(svgString: string, documentRef: Document): Element {
  const template = documentRef.createElement("template");
  template.innerHTML = svgString;
  const element = template.content.firstElementChild;
  if (element === null) {
    throw new Error("SVG string could not be parsed into an element.");
  }
  return element;
}

function createDismissButton(onDismiss: () => void, documentRef: Document): HTMLButtonElement {
  const button = documentRef.createElement("button");
  button.type = "button";
  button.className = "coden-toast-dismiss";

  const svgEl = parseSVGString(SVG_CLOSE, documentRef) as SVGElement;
  button.appendChild(svgEl);
  button.setAttribute("aria-label", "Dismiss toast");
  button.addEventListener("click", onDismiss);
  return button;
}

function createIcon(icon: ToastIcon, documentRef: Document): Element {
  const element = parseSVGString(TOAST_ICON_HTML[icon], documentRef);
  if (icon === "loader" && documentRef.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    (element as SVGElement).style.animation = "none";
  }
  return element;
}

export function createToastElement(
  options: ToastElementOptions,
  onDismiss: () => void,
  documentRef: Document,
): HTMLDivElement {
  const ariaLive = options.role === "alert" ? "assertive" : "polite";
  const container = documentRef.createElement("div");

  container.className = options.className ? `${options.rootClassName} ${options.className}` : options.rootClassName;
  container.setAttribute("data-root-class", options.rootClassName);
  container.setAttribute("data-toast-instance", options.instanceId);
  container.setAttribute("role", options.role);
  container.setAttribute("aria-live", ariaLive);
  container.setAttribute("aria-atomic", "true");

  if (options.content !== null) {
    container.append(...options.content);
  } else if (options.message !== null) {
    if (options.icon !== null) {
      container.appendChild(createIcon(options.icon, documentRef));
    }

    const messageSpan = documentRef.createElement("span");
    messageSpan.setAttribute("data-toast-message", "");
    messageSpan.textContent = options.message;
    container.appendChild(messageSpan);
  }

  if (options.isDismissable) {
    container.appendChild(createDismissButton(onDismiss, documentRef));
  }

  applyTokens(container.style, options.tokens);

  return container;
}

interface ContainerParams {
  parent: HTMLElement;
  position: ToastPosition;
  instanceId: string;
  margin?: string | { x?: string; y?: string };
}

function getContainerKey(params: { instanceId: string; position: ToastPosition }): string {
  const { instanceId, position } = params;
  return `${instanceId}-${position}`;
}

export function getContainer(params: ContainerParams): HTMLDivElement | null {
  const { parent, position, instanceId } = params;
  const id = getContainerKey({ instanceId, position });
  return (
    Array.from(parent.children).find(
      (element): element is HTMLDivElement =>
        element.tagName === "DIV" && element.getAttribute("data-toast-container") === id,
    ) ?? null
  );
}

export function getOrCreateContainer(params: ContainerParams): HTMLDivElement {
  const { parent, position, instanceId, margin } = params;
  let container = getContainer({ parent, position, instanceId });

  if (!container) {
    const id = getContainerKey({ instanceId, position });
    container = parent.ownerDocument.createElement("div");
    container.setAttribute("data-toast-container", id);
    container.setAttribute("data-toast-instance", instanceId);
    container.className = POSITION_CONTAINER_CLASSES[position];
    parent.appendChild(container);
  }

  if (margin) {
    if (typeof margin === "string") {
      container.style.setProperty("--toast-margin-x", margin);
      container.style.setProperty("--toast-margin-y", margin);
    } else {
      if (margin.x) {
        container.style.setProperty("--toast-margin-x", margin.x);
      } else {
        container.style.removeProperty("--toast-margin-x");
      }
      if (margin.y) {
        container.style.setProperty("--toast-margin-y", margin.y);
      } else {
        container.style.removeProperty("--toast-margin-y");
      }
    }
  } else {
    container.style.removeProperty("--toast-margin-x");
    container.style.removeProperty("--toast-margin-y");
  }

  return container;
}

export function removeInstanceContainers(params: { parent: HTMLElement; instanceId: string }): void {
  const { parent, instanceId } = params;
  Array.from(parent.children)
    .filter((element) => element.getAttribute("data-toast-instance") === instanceId)
    .forEach((element) => element.remove());
}

function getKeyframes(position: ToastPosition): Keyframe[] {
  if (position === "top-center") {
    return [
      { transform: "translateY(-100%)", opacity: 0 },
      { transform: "translateY(0)", opacity: 1 },
    ];
  }
  if (position === "bottom-center") {
    return [
      { transform: "translateY(100%)", opacity: 0 },
      { transform: "translateY(0)", opacity: 1 },
    ];
  }
  if (position === "center") {
    return [
      { transform: "scale(0.9)", opacity: 0 },
      { transform: "scale(1)", opacity: 1 },
    ];
  }

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
  shouldCompleteOnCancel = false,
): void {
  const finish = createSingleRunCallback(onFinish);
  const prefersReducedMotion = element.ownerDocument.defaultView?.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  if (prefersReducedMotion) {
    finish?.();
    return;
  }

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
    if (shouldCompleteOnCancel) {
      animation.oncancel = finish;
    }
  } catch {
    finish();
  }
}

export function animateIn(params: { element: HTMLDivElement; position: ToastPosition; onFinish?: () => void }): void {
  const { element, position, onFinish } = params;
  runAnimation(element, getKeyframes(position), onFinish);
}

export function animateOut(params: { element: HTMLDivElement; position: ToastPosition; onComplete: () => void }): void {
  const { element, position, onComplete } = params;
  runAnimation(element, [...getKeyframes(position)].reverse(), onComplete, true);
}

export function animateStackChange(container: HTMLDivElement, updateStack: () => void): void {
  const previousRects = new Map<HTMLDivElement, DOMRect>();
  let stackOffset = 0;

  Array.from(container.children).forEach((child) => {
    if (child.tagName === "DIV") {
      const div = child as HTMLDivElement;
      previousRects.set(div, div.getBoundingClientRect());
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
    if (child.tagName !== "DIV" || previousRects.has(child as HTMLDivElement)) {
      return;
    }
    runAnimation(child as HTMLDivElement, [{ translate: `0 ${stackOffset}px` }, { translate: "0 0" }]);
  });
}
