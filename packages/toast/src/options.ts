/* eslint-disable no-control-regex */
import { buildInlineStyle } from "./tokens";
import type { ToastContent, ToastIcon, ToastPosition, ToastRole, ToastTokens, ToastUpdateOptions } from "./types";

export interface ResolvedToastConfig {
  readonly instanceId: string;
  readonly position: ToastPosition;
  readonly duration: number;
  readonly isDismissable: boolean;
  readonly shouldAutoDismiss: boolean;
  readonly maxVisible: number;
  readonly margin?: string | { x?: string; y?: string };
}

export const DEFAULT_CONFIG: Omit<ResolvedToastConfig, "instanceId" | "margin"> = {
  position: "top-right",
  duration: 4000,
  isDismissable: false,
  shouldAutoDismiss: true,
  maxVisible: 5,
};

export const DEFAULT_ROLE: ToastRole = "status";

/**
 * Shared structural class applied to every toast element regardless of variant.
 * Drives layout, typography, border radius, and pointer-events.
 * Each variant (semantic/loading/custom) prepends this and appends its own
 * spacing + color class (e.g. `toast-success`).
 */
export const TOAST_SHAPE_CLASS =
  "rounded-xl border-2 text-sm font-medium font-default pointer-events-auto flex items-center";

/**
 * Full root class for the default (custom/no-variant) toast.
 * Used as the fallback when no variant-specific rootClassName is provided.
 */
export const DEFAULT_TOAST_CLASS = `${TOAST_SHAPE_CLASS} min-w-40 p-3 gap-2 toast-default`;

// --- Normalized options used internally by Toast ----------------------------

export interface NormalizedToastOptions {
  readonly instanceId: string;
  readonly shouldAutoDismiss: boolean;
  readonly content: readonly Node[] | null;
  readonly duration: number;
  readonly icon: ToastIcon | null;
  readonly isDismissable: boolean;
  readonly message: string | null;
  readonly position: ToastPosition;
  readonly role: ToastRole;
  readonly rootClassName: string;
  readonly tokens: ToastTokens | null;
  readonly margin?: string | { x?: string; y?: string };
}

export interface ToastPresetOptions {
  readonly shouldAutoDismiss?: boolean;
  readonly icon?: ToastIcon;
  readonly role?: ToastRole;
  readonly rootClassName?: string;
}

// --- Helpers ----------------------------------------------------------------

function hasNonEmptyString(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function joinClassNames(...classNames: Array<string | undefined>): string {
  return classNames.filter((c): c is string => hasNonEmptyString(c)).join(" ");
}

const SAFE_TAGS = new Set([
  "a",
  "b",
  "br",
  "code",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "ul",
]);

const SAFE_ATTRIBUTES = new Set(["class", "id", "style", "target", "rel"]);

const URL_ATTRIBUTES = new Set(["href"]);

function sanitizeElement(el: Element): void {
  const tagName = el.tagName.toLowerCase();

  if (!SAFE_TAGS.has(tagName)) {
    if (["script", "style", "iframe", "object", "embed"].includes(tagName)) {
      el.remove();
      return;
    }
    const parent = el.parentNode;
    if (parent) {
      Array.from(el.children).forEach(sanitizeElement);
      while (el.firstChild) {
        parent.insertBefore(el.firstChild, el);
      }
      el.remove();
    }
    return;
  }

  const attrs = Array.from(el.attributes);
  for (const attr of attrs) {
    const attrName = attr.name.toLowerCase();

    if (URL_ATTRIBUTES.has(attrName)) {
      // eslint-disable-next-line no-control-regex
      const val = attr.value
        .replace(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, "")
        .toLowerCase();
      if (val.startsWith("javascript:") || val.startsWith("data:") || val.startsWith("vbscript:")) {
        el.removeAttribute(attr.name);
      }
    } else if (!SAFE_ATTRIBUTES.has(attrName)) {
      el.removeAttribute(attr.name);
    }
  }

  Array.from(el.children).forEach(sanitizeElement);
}

function sanitizeFragment(fragment: DocumentFragment): void {
  Array.from(fragment.children).forEach(sanitizeElement);
}

function resolveToastContent(content: ToastContent): readonly Node[] {
  const resolved = typeof content === "function" ? content() : content;

  if (typeof resolved === "string") {
    if (!hasNonEmptyString(resolved)) {
      throw new Error("Toast content must not be an empty string.");
    }
    const template = document.createElement("template");
    template.innerHTML = resolved;

    sanitizeFragment(template.content);

    return Object.freeze(Array.from(template.content.childNodes));
  }

  if (!(resolved instanceof Node)) {
    throw new Error("Toast content must resolve to a string or DOM Node.");
  }

  if (resolved instanceof DocumentFragment) {
    return Object.freeze(Array.from(resolved.childNodes));
  }

  return Object.freeze([resolved]);
}

function assertDuration(duration: number | undefined): void {
  if (duration === undefined) {
    return;
  }
  if (!Number.isFinite(duration) || duration < 0) {
    throw new Error("Toast duration must be a finite number greater than or equal to 0.");
  }
}

// --- Public normalizer -------------------------------------------------------

export interface RawToastOptions {
  message?: string;
  content?: ToastContent;
  icon?: ToastIcon;
  position?: ToastPosition;
  duration?: number;
  isDismissable?: boolean;
  shouldAutoDismiss?: boolean;
  tokens?: ToastTokens;
  className?: string;
  role?: ToastRole;
  margin?: string | { x?: string; y?: string };
}

export function normalizeToastOptions(params: {
  options: RawToastOptions;
  preset: ToastPresetOptions | null;
  config: ResolvedToastConfig;
}): Readonly<NormalizedToastOptions> {
  const { options, preset, config } = params;
  const { content, message } = options;

  if (content === undefined) {
    if (!hasNonEmptyString(message)) {
      throw new Error("Toast requires a non-empty message or content.");
    }
  } else if (typeof content === "string" && !hasNonEmptyString(content)) {
    throw new Error("Toast content must not be an empty string.");
  }

  assertDuration(options.duration);

  return Object.freeze({
    instanceId: config.instanceId,
    shouldAutoDismiss: options.shouldAutoDismiss ?? preset?.shouldAutoDismiss ?? config.shouldAutoDismiss,
    content: content === undefined ? null : resolveToastContent(content),
    duration: options.duration ?? config.duration,
    icon: content === undefined ? (preset?.icon ?? options.icon ?? null) : null,
    isDismissable: options.isDismissable ?? config.isDismissable,
    message: content === undefined ? (message ?? "") : null,
    position: options.position ?? config.position,
    role: preset?.role ?? options.role ?? DEFAULT_ROLE,
    rootClassName: joinClassNames(preset?.rootClassName ?? DEFAULT_TOAST_CLASS, options.className),
    tokens: options.tokens ?? null,
    margin: options.margin ?? config.margin,
  });
}

// --- Live update helper (patches DOM in place) --------------------------------

export function applyUpdateToElement(element: HTMLDivElement, update: ToastUpdateOptions): void {
  if (update.message !== undefined) {
    // Update only the text span, leave icon intact
    const spans = element.querySelectorAll("span");
    if (spans.length > 0) {
      spans[spans.length - 1].textContent = update.message;
    }
  }

  if (update.tokens !== undefined) {
    const inlineStyle = buildInlineStyle(update.tokens);
    element.style.cssText = inlineStyle;
  }

  if (update.className !== undefined) {
    // Replace only the user-added class portion — keep root class intact
    const dataClass = element.getAttribute("data-root-class") ?? "";
    element.className = joinClassNames(dataClass, update.className);
  }
}
