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

const SVG_SUCCESS =
  '<svg class="size-5 shrink-0" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></svg>';

const SVG_ERROR =
  '<svg class="size-5 shrink-0" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></svg>';

const SVG_WARNING =
  '<svg class="size-5 shrink-0" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>';

const SVG_INFO =
  '<svg class="size-5 shrink-0" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>';

const SVG_LOADER =
  '<svg class="size-5 shrink-0 animate-spin" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4" /><path d="m16.2 7.8 2.9-2.9" /><path d="M18 12h4" /><path d="m16.2 16.2 2.9 2.9" /><path d="M12 18v4" /><path d="m4.9 19.1 2.9-2.9" /><path d="M2 12h4" /><path d="m4.9 4.9 2.9 2.9" /></svg>';

const SVG_CLOSE =
  '<svg aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>';

const TOAST_ICON_HTML: Record<ToastIcon, string> = {
  success: SVG_SUCCESS,
  error: SVG_ERROR,
  warning: SVG_WARNING,
  info: SVG_INFO,
  loader: SVG_LOADER,
};

function parseSVGString(svgString: string): Element {
  const template = document.createElement("template");
  template.innerHTML = svgString;
  const element = template.content.firstElementChild;
  if (element === null) {
    throw new Error("SVG string could not be parsed into an element.");
  }
  return element;
}

function createDismissButton(onDismiss: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className =
    // `text-inherit` overrides the `color` set by @codenhub/styles btn base rule so that
    // `stroke="currentColor"` on the inner SVG uses the toast container's text color.
    // The reset classes (bg-transparent, border-0, p-0, min-h-0, font-inherit) neutralize
    // the global `btn` base rule that @codenhub/styles/native.css applies to all <button>s.
    "text-inherit bg-transparent border-0 p-0 min-h-0 font-inherit ml-auto -mr-1 inline-flex size-4 items-center justify-center rounded-full cursor-pointer shrink-0 opacity-70 transition-opacity duration-200 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current";

  const svgEl = parseSVGString(SVG_CLOSE) as SVGElement;
  // Set dimensions via inline styles so they are immune to any CSS rule override.
  // SVG presentation attributes (width/height) have zero specificity and can be
  // overridden by even the lowest-specificity CSS rule.
  svgEl.style.width = "1rem";
  svgEl.style.height = "1rem";
  button.appendChild(svgEl);
  button.setAttribute("aria-label", "Dismiss toast");
  button.addEventListener("click", onDismiss);
  return button;
}

function createIcon(icon: ToastIcon): Element {
  return parseSVGString(TOAST_ICON_HTML[icon]);
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
