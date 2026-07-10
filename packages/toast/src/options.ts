import { assertValidTokens, replaceTokens } from "./tokens";
import type {
  ToastAppearance,
  ToastContent,
  ToastIcon,
  ToastPosition,
  ToastRole,
  ToastTokens,
  ToastUpdateOptions,
} from "./types";

/**
 * Resolved runtime configurations for a Toaster instance.
 */
export interface ResolvedToastConfig {
  /** Unique toaster instance ID for CSS scoping. */
  readonly instanceId: string;
  /** Viewport position for active stack containers. */
  readonly position: ToastPosition;
  /** Default visibility duration in milliseconds. */
  readonly duration: number;
  /** Whether toasts show a close button by default. */
  readonly isDismissable: boolean;
  /** Whether toasts automatically dismiss after duration. */
  readonly shouldAutoDismiss: boolean;
  /** Maximum number of active toasts displayed simultaneously. */
  readonly maxVisible: number;
  /** Viewport margin configurations. */
  readonly margin?: string | { x?: string; y?: string };
  /** Default visual appearance style. */
  readonly appearance: ToastAppearance;
}

export const DEFAULT_CONFIG: Omit<ResolvedToastConfig, "instanceId" | "margin"> = {
  position: "top-right",
  duration: 4000,
  isDismissable: false,
  shouldAutoDismiss: true,
  maxVisible: 5,
  appearance: "soft-bordered",
};

export const DEFAULT_ROLE: ToastRole = "status";

const TOAST_POSITIONS: readonly ToastPosition[] = [
  "top-left",
  "top-right",
  "bottom-right",
  "bottom-left",
  "top-center",
  "bottom-center",
  "center",
];
const TOAST_APPEARANCES: readonly ToastAppearance[] = ["flat", "soft", "soft-bordered", "left-accent"];
const TOAST_ROLES: readonly ToastRole[] = ["alert", "status"];

export function assertToastPosition(value: unknown): asserts value is ToastPosition {
  if (!TOAST_POSITIONS.includes(value as ToastPosition)) {
    throw new Error(`Invalid toast position: ${String(value)}`);
  }
}

export function assertToastAppearance(value: unknown): asserts value is ToastAppearance {
  if (!TOAST_APPEARANCES.includes(value as ToastAppearance)) {
    throw new Error(`Invalid toast appearance: ${String(value)}`);
  }
}

export function assertToastRole(value: unknown): asserts value is ToastRole {
  if (!TOAST_ROLES.includes(value as ToastRole)) {
    throw new Error(`Invalid toast role: ${String(value)}`);
  }
}

/**
 * Shared structural class applied to every toast element regardless of variant.
 * Drives layout, typography, border radius, and pointer-events.
 * Each variant (semantic/loading/custom) prepends this and appends its own
 * spacing + color class (e.g. `toast-success`).
 */
export const TOAST_SHAPE_CLASS = "coden-toast";

/**
 * Full root class for the default (custom/no-variant) toast.
 * Used as the fallback when no variant-specific rootClassName is provided.
 */
export const DEFAULT_TOAST_CLASS = `${TOAST_SHAPE_CLASS} coden-toast-default`;



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
  readonly className?: string;
  readonly tokens: ToastTokens | null;
  readonly margin?: string | { x?: string; y?: string };
  readonly appearance: ToastAppearance;
}

export interface ToastPresetOptions {
  readonly shouldAutoDismiss?: boolean;
  readonly icon?: ToastIcon;
  readonly role?: ToastRole;
  readonly rootClassName?: string;
}



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

const SAFE_ATTRIBUTES = new Set(["target", "rel"]);

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
      // Strip control characters and unicode spaces to prevent javascript: protocol bypasses
      // eslint-disable-next-line no-control-regex
      const controlRegex = /[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u200D\u2028\u2029\u202F\u205F\u3000\uFEFF]/g;
      const val = attr.value.replace(controlRegex, "").toLowerCase();

      const protocolMatch = val.match(/^[a-z0-9+.-]+:/);
      if (protocolMatch) {
        const protocol = protocolMatch[0];
        if (!["http:", "https:", "mailto:", "tel:"].includes(protocol)) {
          el.removeAttribute(attr.name);
        }
      }
    } else if (attrName === "target") {
      const target = attr.value.toLowerCase();
      if (!["_blank", "_self"].includes(target)) {
        el.removeAttribute(attr.name);
      } else {
        el.setAttribute("target", target);
      }
    } else if (!SAFE_ATTRIBUTES.has(attrName)) {
      el.removeAttribute(attr.name);
    }
  }

  if (tagName === "a" && el.getAttribute("target")?.toLowerCase() === "_blank") {
    el.setAttribute("rel", "noopener noreferrer");
  }

  Array.from(el.children).forEach(sanitizeElement);
}

function sanitizeFragment(fragment: DocumentFragment): void {
  Array.from(fragment.children).forEach(sanitizeElement);
}

function resolveToastContent(content: ToastContent, documentRef: Document): readonly Node[] {
  const resolved = typeof content === "function" ? content() : content;

  if (typeof resolved === "string") {
    if (!hasNonEmptyString(resolved)) {
      throw new Error("Toast content must not be an empty string.");
    }
    const template = documentRef.createElement("template");
    template.innerHTML = resolved;

    sanitizeFragment(template.content);

    return Object.freeze(Array.from(template.content.childNodes));
  }

  if (typeof resolved !== "object" || resolved === null || !("nodeType" in resolved)) {
    throw new Error("Toast content must resolve to a string or DOM Node.");
  }

  const ownerDocument = resolved.nodeType === 9 ? (resolved as Document) : resolved.ownerDocument;
  const NodeConstructor = ownerDocument?.defaultView?.Node;
  if (!NodeConstructor || !(resolved instanceof NodeConstructor) || ![1, 3, 11].includes(resolved.nodeType)) {
    throw new Error("Toast content Node must be an Element, Text, or DocumentFragment.");
  }

  if (resolved.nodeType === 11) {
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
  appearance?: ToastAppearance;
}

export function normalizeToastOptions(params: {
  options: RawToastOptions;
  preset: ToastPresetOptions | null;
  config: ResolvedToastConfig;
  documentRef: Document;
}): Readonly<NormalizedToastOptions> {
  const { options, preset, config, documentRef } = params;
  const { content, message } = options;

  if (content === undefined) {
    if (!hasNonEmptyString(message)) {
      throw new Error("Toast requires a non-empty message or content.");
    }
  } else if (typeof content === "string" && !hasNonEmptyString(content)) {
    throw new Error("Toast content must not be an empty string.");
  }

  assertDuration(options.duration);
  assertValidTokens(options.tokens, documentRef);

  const appearance = options.appearance ?? config.appearance ?? "soft-bordered";
  const position = options.position ?? config.position;
  const role = options.role ?? preset?.role ?? DEFAULT_ROLE;
  assertToastAppearance(appearance);
  assertToastPosition(position);
  assertToastRole(role);

  return Object.freeze({
    instanceId: config.instanceId,
    shouldAutoDismiss: options.shouldAutoDismiss ?? preset?.shouldAutoDismiss ?? config.shouldAutoDismiss,
    content: content === undefined ? null : resolveToastContent(content, documentRef),
    duration: options.duration ?? config.duration,
    icon: content === undefined ? (preset?.icon ?? options.icon ?? null) : null,
    isDismissable: options.isDismissable ?? config.isDismissable,
    message: content === undefined ? (message ?? "") : null,
    position,
    role,
    rootClassName: joinClassNames(preset?.rootClassName ?? DEFAULT_TOAST_CLASS, `toast-appearance-${appearance}`),
    className: options.className,
    tokens: options.tokens ?? null,
    margin: options.margin ?? config.margin,
    appearance,
  });
}



export function applyUpdateToElement(element: HTMLDivElement, update: ToastUpdateOptions): void {
  if (update.message !== undefined) {
    const messageEl = element.querySelector("[data-toast-message]");
    if (messageEl) {
      messageEl.textContent = update.message;
    }
  }

  if (update.tokens !== undefined) {
    assertValidTokens(update.tokens, element.ownerDocument);
    replaceTokens(element.style, update.tokens);
  }

  if (update.className !== undefined) {
    // Replace only the user-added class portion — keep root class intact
    const dataClass = element.getAttribute("data-root-class") ?? "";
    element.className = joinClassNames(dataClass, update.className);
  }
}
