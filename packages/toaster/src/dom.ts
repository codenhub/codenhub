import type { NormalizedToastOptions } from "./options";
import { applyTokens } from "./tokens";
import type { ToastHandle, ToastIcon, ToastPosition } from "./types";

type ToastElementOptions = Pick<
  NormalizedToastOptions,
  | "content"
  | "dismissLabel"
  | "icon"
  | "dismissible"
  | "title"
  | "message"
  | "description"
  | "action"
  | "role"
  | "rootClassName"
  | "className"
  | "instanceClassName"
  | "tokens"
  | "instanceId"
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

const FALLBACK_ANIMATION_DURATION_MS = 400;
const FALLBACK_ANIMATION_EASING = "cubic-bezier(0.2, 0, 0, 1)";

/**
 * Reads `--motion-duration-slow` off the element's computed style, so a
 * consumer or aesthetic that overrides @codenhub/styles' motion tokens
 * changes toast entrance/exit timing along with everything else it styles.
 * Falls back to this package's own default when the token is unset --
 * standalone, or in an environment (such as jsdom) that does not resolve
 * custom properties from a stylesheet.
 */
function readAnimationDuration(element: Element): number {
  const raw = element.ownerDocument.defaultView
    ?.getComputedStyle(element)
    .getPropertyValue("--motion-duration-slow")
    .trim();
  if (!raw) {
    return FALLBACK_ANIMATION_DURATION_MS;
  }
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) {
    return FALLBACK_ANIMATION_DURATION_MS;
  }
  return raw.endsWith("ms") ? parsed : parsed * 1000;
}

/** Reads `--motion-ease` the same way {@link readAnimationDuration} reads its duration token. */
function readAnimationEasing(element: Element): string {
  const raw = element.ownerDocument.defaultView?.getComputedStyle(element).getPropertyValue("--motion-ease").trim();
  return raw && raw.length > 0 ? raw : FALLBACK_ANIMATION_EASING;
}

function getAnimationOptions(element: Element): KeyframeAnimationOptions {
  return {
    duration: readAnimationDuration(element),
    easing: readAnimationEasing(element),
    fill: "both",
  };
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

interface SvgChildSpec {
  readonly tag: "circle" | "path";
  readonly attributes: Readonly<Record<string, string>>;
}

interface SvgSpec {
  readonly className?: string;
  readonly rootAttributes?: Readonly<Record<string, string>>;
  readonly children: readonly SvgChildSpec[];
}

const STROKE_ICON_ATTRIBUTES = {
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "2",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
} as const;

/**
 * Built-in icon geometry, declared as data rather than markup: every element
 * is constructed with `createElementNS` below, never parsed from an HTML/SVG
 * string. `Element.innerHTML` is a Trusted-Types-guarded sink -- even a
 * hardcoded, trusted string reaches it and throws under a host policy that
 * requires a `TrustedHTML` assignment, which stranded these otherwise-safe
 * built-in icons alongside genuinely untrusted custom content. Constructing
 * the DOM directly sidesteps that sink entirely, so a security policy that
 * blocks the custom-content path (see `options.ts`) does not also block a
 * plain semantic toast.
 */
const ICON_SPECS: Record<ToastIcon, SvgSpec> = {
  success: {
    className: "coden-toast-icon",
    rootAttributes: STROKE_ICON_ATTRIBUTES,
    children: [
      { tag: "circle", attributes: { cx: "12", cy: "12", r: "10" } },
      { tag: "path", attributes: { d: "m9 12 2 2 4-4" } },
    ],
  },
  error: {
    className: "coden-toast-icon",
    rootAttributes: STROKE_ICON_ATTRIBUTES,
    children: [
      { tag: "circle", attributes: { cx: "12", cy: "12", r: "10" } },
      { tag: "path", attributes: { d: "m15 9-6 6" } },
      { tag: "path", attributes: { d: "m9 9 6 6" } },
    ],
  },
  warning: {
    className: "coden-toast-icon",
    rootAttributes: STROKE_ICON_ATTRIBUTES,
    children: [
      { tag: "path", attributes: { d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" } },
      { tag: "path", attributes: { d: "M12 9v4" } },
      { tag: "path", attributes: { d: "M12 17h.01" } },
    ],
  },
  info: {
    className: "coden-toast-icon",
    rootAttributes: STROKE_ICON_ATTRIBUTES,
    children: [
      { tag: "circle", attributes: { cx: "12", cy: "12", r: "10" } },
      { tag: "path", attributes: { d: "M12 16v-4" } },
      { tag: "path", attributes: { d: "M12 8h.01" } },
    ],
  },
  loader: {
    className: "coden-toast-icon coden-toast-spinner",
    rootAttributes: { stroke: "currentColor" },
    children: [
      {
        tag: "circle",
        attributes: {
          cx: "12",
          cy: "12",
          r: "9.5",
          fill: "none",
          "stroke-width": "3",
          "stroke-linecap": "round",
          "stroke-dasharray": "42 150",
        },
      },
    ],
  },
};

const CLOSE_ICON_SPEC: SvgSpec = {
  rootAttributes: STROKE_ICON_ATTRIBUTES,
  children: [
    { tag: "path", attributes: { d: "M18 6 6 18" } },
    { tag: "path", attributes: { d: "m6 6 12 12" } },
  ],
};

function buildSvg(spec: SvgSpec, documentRef: Document): SVGElement {
  const svgElement = documentRef.createElementNS(SVG_NAMESPACE, "svg");
  svgElement.setAttribute("aria-hidden", "true");
  svgElement.setAttribute("viewBox", "0 0 24 24");
  if (spec.className) {
    svgElement.setAttribute("class", spec.className);
  }
  for (const [name, value] of Object.entries(spec.rootAttributes ?? {})) {
    svgElement.setAttribute(name, value);
  }
  for (const child of spec.children) {
    const childElement = documentRef.createElementNS(SVG_NAMESPACE, child.tag);
    for (const [name, value] of Object.entries(child.attributes)) {
      childElement.setAttribute(name, value);
    }
    svgElement.appendChild(childElement);
  }
  return svgElement;
}

function createDismissButton(onDismiss: () => void, documentRef: Document, dismissLabel: string): HTMLButtonElement {
  const button = documentRef.createElement("button");
  button.type = "button";
  button.className = "coden-toast-dismiss";
  button.appendChild(buildSvg(CLOSE_ICON_SPEC, documentRef));
  button.setAttribute("aria-label", dismissLabel);
  button.addEventListener("click", onDismiss);
  return button;
}

function createIcon(icon: ToastIcon, documentRef: Document): SVGElement {
  const element = buildSvg(ICON_SPECS[icon], documentRef);
  if (icon === "loader" && documentRef.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    element.style.animation = "none";
  }
  return element;
}

/** Finds the message-icon `<svg>` created by {@link createIcon}, if any -- never the dismiss button's own icon, which carries no `coden-toast-icon` class, and never custom user-provided SVGs. */
function findToastIcon(container: HTMLDivElement): Element | null {
  const main = Array.from(container.children).find((child) => child.classList.contains("coden-toast-main"));
  if (main) {
    for (const child of main.children) {
      if (child.tagName.toLowerCase() === "svg" && child.classList.contains("coden-toast-icon")) {
        return child;
      }
    }
  }
  for (const child of container.children) {
    if (child.tagName.toLowerCase() === "svg" && child.classList.contains("coden-toast-icon")) {
      return child;
    }
  }
  return null;
}

/**
 * Swaps, inserts, or removes a message-based toast's icon in place, without
 * touching the message text or dismiss button. Used by `Toast.update()`
 * (see `toast-base.ts`) when a live toast's icon or severity `type` changes.
 * A content-based toast (no `[data-toast-message]` slot) has nowhere
 * sensible to put an icon and is left untouched, the same silent no-op
 * precedent a message update on a content-based toast already has.
 */
export function updateToastIcon(container: HTMLDivElement, icon: ToastIcon | null, documentRef: Document): void {
  const existing = findToastIcon(container);

  if (icon === null) {
    existing?.remove();
    return;
  }

  const next = createIcon(icon, documentRef);
  if (existing) {
    existing.replaceWith(next);
    return;
  }

  const targetParent = container.querySelector<HTMLElement>(".coden-toast-main") ?? container;
  const contentEl =
    targetParent.querySelector("[data-toast-content]") ?? targetParent.querySelector("[data-toast-message]");
  if (contentEl) {
    if (contentEl.parentElement === targetParent) {
      targetParent.insertBefore(next, contentEl);
    } else {
      let directChild: Node = contentEl;
      while (directChild.parentNode && directChild.parentNode !== targetParent) {
        directChild = directChild.parentNode;
      }
      targetParent.insertBefore(next, directChild);
    }
  } else if (targetParent.firstChild) {
    targetParent.insertBefore(next, targetParent.firstChild);
  } else {
    targetParent.appendChild(next);
  }
}

/**
 * Swaps a toast element's severity root class (e.g. `coden-toast-default`
 * -> `coden-toast-success`) in place, leaving every other class -- the
 * instance default and any per-call extra class -- untouched. Used by
 * `Toast.update()`'s `type` field.
 */
export function applyRootClassChange(
  element: HTMLElement,
  previousRootClassName: string,
  nextRootClassName: string,
): void {
  const previousTokens = previousRootClassName.split(" ").filter(Boolean);
  const nextTokens = nextRootClassName.split(" ").filter(Boolean);
  if (previousTokens.length > 0) {
    element.classList.remove(...previousTokens);
  }
  if (nextTokens.length > 0) {
    element.classList.add(...nextTokens);
  }
  element.setAttribute("data-root-class", nextRootClassName);
}

/**
 * Builds the toast's outer, empty announcement region: `role`/`aria-live`
 * carried from the first moment it exists, with no content inside yet.
 *
 * Deliberately separate from {@link populateToastContent}: assistive
 * technology tracks a live region from the mutation that inserts it, and a
 * region that arrives already full of content is one mutation an AT's
 * observer never had the chance to start watching (the ARIA22 technique).
 * Insert the empty shell this returns into the document first, then call
 * {@link populateToastContent} on the now-connected element.
 */
export function createToastShell(
  options: Pick<
    ToastElementOptions,
    "className" | "instanceClassName" | "instanceId" | "role" | "rootClassName" | "tokens"
  >,
  documentRef: Document,
): HTMLDivElement {
  const ariaLive = options.role === "alert" ? "assertive" : "polite";
  const container = documentRef.createElement("div");

  container.className = options.className ? `${options.rootClassName} ${options.className}` : options.rootClassName;
  container.setAttribute("data-root-class", options.rootClassName);
  container.setAttribute("data-instance-class", options.instanceClassName ?? "");
  container.setAttribute("data-toast-instance", options.instanceId);
  container.setAttribute("role", options.role);
  container.setAttribute("aria-live", ariaLive);
  container.setAttribute("aria-atomic", "true");
  applyTokens(container.style, options.tokens);

  return container;
}

/**
 * Fills an already-connected {@link createToastShell} region with its
 * message/icon or custom content and dismiss control. Call only after the
 * shell has been inserted into the document.
 */
export function populateToastContent(
  container: HTMLDivElement,
  options: Pick<
    ToastElementOptions,
    "action" | "content" | "description" | "dismissible" | "dismissLabel" | "icon" | "message" | "title"
  >,
  onDismiss: () => void,
  documentRef: Document,
  handle?: ToastHandle,
): void {
  if (options.content !== null) {
    container.append(...options.content);
    if (options.dismissible) {
      container.appendChild(createDismissButton(onDismiss, documentRef, options.dismissLabel));
    }
    return;
  }

  const mainWrapper = documentRef.createElement("div");
  mainWrapper.className = "coden-toast-main";
  mainWrapper.setAttribute("data-toast-main", "");

  if (options.icon !== null) {
    mainWrapper.appendChild(createIcon(options.icon, documentRef));
  }

  const resolvedTitle = options.title ?? (options.description !== null ? options.message : null);
  const resolvedDescription = options.description ?? (options.title !== null ? options.message : null);
  const hasStructuredContent = resolvedDescription !== null;

  if (hasStructuredContent) {
    const contentWrapper = documentRef.createElement("div");
    contentWrapper.className = "coden-toast-content";
    contentWrapper.setAttribute("data-toast-content", "");

    if (resolvedTitle !== null) {
      const titleEl = documentRef.createElement("div");
      titleEl.className = "coden-toast-title";
      titleEl.setAttribute("data-toast-title", "");
      titleEl.setAttribute("data-toast-message", "");
      titleEl.textContent = resolvedTitle;
      contentWrapper.appendChild(titleEl);
    }

    const descEl = documentRef.createElement("div");
    descEl.className = "coden-toast-description";
    descEl.setAttribute("data-toast-description", "");
    if (resolvedTitle === null) {
      descEl.setAttribute("data-toast-message", "");
    }
    descEl.textContent = resolvedDescription;
    contentWrapper.appendChild(descEl);

    mainWrapper.appendChild(contentWrapper);
  } else {
    const singleText = options.title ?? options.message;
    if (singleText !== null) {
      const messageSpan = documentRef.createElement("span");
      messageSpan.setAttribute("data-toast-message", "");
      messageSpan.textContent = singleText;
      mainWrapper.appendChild(messageSpan);
    }
  }

  container.appendChild(mainWrapper);

  if (options.action || options.dismissible) {
    const actionsWrapper = documentRef.createElement("div");
    actionsWrapper.className = "coden-toast-actions";
    actionsWrapper.setAttribute("data-toast-actions", "");

    if (options.action) {
      const actionButton = documentRef.createElement("button");
      actionButton.type = "button";
      actionButton.className = "coden-toast-action";
      actionButton.setAttribute("data-toast-action", "");
      actionButton.textContent = options.action.label;
      actionButton.addEventListener("click", (event) => {
        if (handle) {
          options.action?.onClick(event, handle);
        }
      });
      actionsWrapper.appendChild(actionButton);
    }

    if (options.dismissible) {
      actionsWrapper.appendChild(createDismissButton(onDismiss, documentRef, options.dismissLabel));
    }

    container.appendChild(actionsWrapper);
  }
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

/**
 * Margin is written onto the shared position container, not a per-toast
 * element, so it is deliberately a property of the stack rather than of any
 * one toast: the most recently dispatched explicit value wins for every
 * toast already showing at that position, and a dispatch that omits
 * `margin` leaves the stack's current value untouched rather than clearing
 * it. See `ToasterConfig.margin`'s own doc comment for the consumer-facing
 * contract.
 */
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

  if (margin !== undefined) {
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
  }

  return container;
}

export function removeInstanceContainers(params: { parent: HTMLElement; instanceId: string }): void {
  const { parent, instanceId } = params;
  Array.from(parent.children)
    .filter((element) => element.getAttribute("data-toast-instance") === instanceId)
    .forEach((element) => element.remove());
}

const TOP_ANCHORED_POSITIONS = new Set<ToastPosition>(["top-left", "top-right", "top-center"]);

/**
 * Whether a position's stack is anchored to the top of the viewport. These
 * use plain `column` with a new toast inserted at the *start* of the DOM
 * (see `Toast.render()`), not `column-reverse` with one appended at the
 * end: a reversed flex container cannot be scrolled via `scrollTop` in
 * every engine, which would defeat the stack's own overflow scrolling.
 */
export function isTopAnchoredPosition(position: ToastPosition): boolean {
  return TOP_ANCHORED_POSITIONS.has(position);
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

/** @returns The running `Animation`, so a caller (e.g. `Toast.destroyImmediately()`) can cancel it early; `null` when nothing is actually animating (reduced motion, no `Element.animate`, or an already-finished synchronous path). */
function runAnimation(
  element: HTMLDivElement,
  keyframes: Keyframe[],
  onFinish?: () => void,
  shouldCompleteOnCancel = false,
): Animation | null {
  const finish = createSingleRunCallback(onFinish);
  const prefersReducedMotion = element.ownerDocument.defaultView?.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  if (prefersReducedMotion) {
    finish?.();
    return null;
  }

  if (!finish) {
    try {
      return element.animate(keyframes, getAnimationOptions(element));
    } catch {
      // Animation support unavailable, nothing pending.
      return null;
    }
  }

  if (typeof element.animate !== "function") {
    finish();
    return null;
  }

  try {
    const animation = element.animate(keyframes, getAnimationOptions(element));
    animation.onfinish = finish;
    if (shouldCompleteOnCancel) {
      animation.oncancel = finish;
    }
    return animation;
  } catch {
    finish();
    return null;
  }
}

export function animateIn(params: {
  element: HTMLDivElement;
  position: ToastPosition;
  onFinish?: () => void;
}): Animation | null {
  const { element, position, onFinish } = params;
  // Complete on cancellation too, same as animateOut: a canceled entrance
  // animation previously fired neither callback, leaving the toast stuck
  // "visible" with no "shown" notification and no auto-dismiss timer ever
  // scheduled -- see Toast.render()'s onFinish, which still guards against
  // running twice or after the toast has already moved on.
  return runAnimation(element, getKeyframes(position), onFinish, true);
}

export function animateOut(params: {
  element: HTMLDivElement;
  position: ToastPosition;
  onComplete: () => void;
}): Animation | null {
  const { element, position, onComplete } = params;
  return runAnimation(element, [...getKeyframes(position)].reverse(), onComplete, true);
}

/**
 * Snapshots every current child's position before a stack mutation that will
 * shift them -- the "first" half of the FLIP technique {@link playStackShift}
 * completes. Split from it (rather than one function wrapping the mutation)
 * so a caller that inserts an *empty* shell before populating it -- see
 * `Toast.render()` -- can defer measuring the "next" positions until the
 * shell has its real, final content height; measuring right after insertion
 * would capture the empty shell's much shorter height, understating how far
 * existing siblings actually need to move and letting the true, larger shift
 * happen later as an unanimated snap.
 */
export function captureStackRects(container: HTMLDivElement): Map<HTMLDivElement, DOMRect> {
  const rects = new Map<HTMLDivElement, DOMRect>();
  Array.from(container.children).forEach((child) => {
    if (child.tagName === "DIV") {
      rects.set(child as HTMLDivElement, child.getBoundingClientRect());
    }
  });
  return rects;
}

/**
 * The "invert and play" half of the FLIP technique: compares each
 * previously-captured child against its current (post-mutation) position and
 * animates the difference away, so a stack reflow reads as a smooth push
 * instead of an instant jump. Also nudges any child absent from
 * `previousRects` (a newly-inserted toast) by the same offset, so it slides
 * into place alongside its siblings rather than appearing to teleport
 * straight into its resting slot.
 */
export function playStackShift(container: HTMLDivElement, previousRects: Map<HTMLDivElement, DOMRect>): void {
  let stackOffset = 0;

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

/** Convenience wrapper over {@link captureStackRects}/{@link playStackShift} for a mutation that already leaves every child at its final size (e.g. removal) -- see their own doc comments for when a caller needs the two halves split instead. */
export function animateStackChange(container: HTMLDivElement, updateStack: () => void): void {
  const previousRects = captureStackRects(container);
  updateStack();
  playStackShift(container, previousRects);
}
