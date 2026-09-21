import { assertValidTokens, replaceTokens } from "./tokens";
import type {
  SemanticType,
  ToastAction,
  ToastContent,
  ToastHandle,
  ToastIcon,
  ToastLabels,
  ToastPosition,
  ToastRole,
  ToastTokens,
} from "./types";

/** Built-in text this package renders with no per-call override of its own -- see `ToastLabels.dismiss`. */
export const DEFAULT_DISMISS_LABEL = "Dismiss toast";

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
  readonly dismissible: boolean;
  /** Whether toasts automatically dismiss after duration. */
  readonly autoDismiss: boolean;
  /** Maximum number of active toasts displayed simultaneously. */
  readonly maxVisible: number;
  /** Viewport margin configurations. */
  readonly margin?: string | { x?: string; y?: string };
  /** Extra CSS class name applied to every toast and dialog from this instance. */
  readonly className?: string;
  /** Accessible label for a toast's dismiss button. */
  readonly dismissLabel: string;
  /** Instance-level default labels for dialog buttons (confirm/cancel/submit/ok). */
  readonly dialogLabels: ToastLabels;
}

export const DEFAULT_CONFIG: Omit<ResolvedToastConfig, "instanceId" | "margin" | "dismissLabel" | "dialogLabels"> = {
  position: "top-right",
  duration: 4000,
  dismissible: false,
  autoDismiss: true,
  maxVisible: 5,
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
const TOAST_ROLES: readonly ToastRole[] = ["alert", "status"];

export function assertToastPosition(value: unknown): asserts value is ToastPosition {
  if (!TOAST_POSITIONS.includes(value as ToastPosition)) {
    throw new Error(`Invalid toast position: ${String(value)}`);
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

/**
 * Shared severity mappings for the four semantic categories, used both by
 * `SemanticToast`'s construction-time preset (see `variants/semantic.ts`)
 * and by `Toast.update()`'s `type` field so a toast can switch severity
 * after it has already been dispatched (e.g. a loading toast completing
 * into a success toast).
 */
export const SEMANTIC_ROOT_CLASS_NAMES: Record<SemanticType | "default", string> = {
  success: `${TOAST_SHAPE_CLASS} coden-toast-success`,
  error: `${TOAST_SHAPE_CLASS} coden-toast-error`,
  warning: `${TOAST_SHAPE_CLASS} coden-toast-warning`,
  info: `${TOAST_SHAPE_CLASS} coden-toast-info`,
  default: `${TOAST_SHAPE_CLASS} coden-toast-default`,
};

export const SEMANTIC_ICONS: Record<SemanticType | "default", ToastIcon | null> = {
  success: "success",
  error: "error",
  warning: "warning",
  info: "info",
  default: null,
};

export const SEMANTIC_ROLES: Record<SemanticType | "default", ToastRole> = {
  success: "status",
  error: "alert",
  warning: "alert",
  info: "status",
  default: "status",
};

export function assertSemanticType(value: unknown): asserts value is SemanticType | "default" {
  if (!Object.hasOwn(SEMANTIC_ROLES, value as PropertyKey)) {
    throw new Error(`Invalid semantic toast type: ${String(value)}`);
  }
}

export interface NormalizedToastOptions {
  readonly instanceId: string;
  readonly autoDismiss: boolean;
  readonly content: readonly Node[] | null;
  readonly duration: number;
  readonly icon: ToastIcon | null;
  readonly dismissible: boolean;
  readonly title: string | null;
  readonly message: string | null;
  readonly description: string | null;
  readonly action: ToastAction | null;
  readonly position: ToastPosition;
  readonly role: ToastRole;
  readonly rootClassName: string;
  readonly className?: string;
  /** The instance-level `ToasterConfig.className` alone, kept separate so an
   *  `update()` can re-append it instead of dropping it (see
   *  `applyUpdateToElement`). */
  readonly instanceClassName?: string;
  readonly tokens: ToastTokens | null;
  readonly margin?: string | { x?: string; y?: string };
  /** Accessible label for this toast's dismiss button, from `ResolvedToastConfig.dismissLabel`. */
  readonly dismissLabel: string;
}

export interface ToastPresetOptions {
  readonly autoDismiss?: boolean;
  readonly icon?: ToastIcon | null;
  readonly role?: ToastRole;
  readonly rootClassName?: string;
}

export function hasNonEmptyString(value: string | undefined | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function joinClassNames(...classNames: Array<string | undefined>): string {
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

export function resolveToastContent(
  content: ToastContent,
  documentRef: Document,
  handle?: ToastHandle,
): readonly Node[] {
  const resolved = typeof content === "function" ? content(handle!) : content;

  if (typeof resolved === "string") {
    if (!hasNonEmptyString(resolved)) {
      throw new Error("Toast content must not be an empty string.");
    }
    const template = documentRef.createElement("template");
    template.innerHTML = resolved;

    sanitizeFragment(template.content);

    // The input string was non-empty, but sanitization (e.g. a script-only
    // string with every element stripped) can still leave nothing behind.
    // Treated the same as an originally-empty string rather than silently
    // rendering a blank toast.
    if (template.content.childNodes.length === 0) {
      throw new Error("Toast content must not be an empty string.");
    }

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

export function assertDuration(duration: number | undefined): void {
  if (duration === undefined) {
    return;
  }
  if (!Number.isFinite(duration) || duration < 0) {
    throw new Error("Toast duration must be a finite number greater than or equal to 0.");
  }
}

export interface RawToastOptions {
  type?: SemanticType | "default";
  title?: string;
  message?: string;
  description?: string;
  action?: ToastAction;
  content?: ToastContent;
  icon?: ToastIcon | null;
  position?: ToastPosition;
  duration?: number;
  dismissible?: boolean;
  closeButton?: boolean;
  autoDismiss?: boolean;
  tokens?: ToastTokens;
  className?: string;
  role?: ToastRole;
  margin?: string | { x?: string; y?: string };
}

export function normalizeToastOptions(params: {
  options: RawToastOptions;
  preset: ToastPresetOptions | null;
  config: ResolvedToastConfig;
  documentRef: Document;
  handle?: ToastHandle;
}): Readonly<NormalizedToastOptions> {
  const { options, preset, config, documentRef, handle } = params;
  const { content, message, title, description, action } = options;

  if (content === undefined) {
    if (!hasNonEmptyString(message) && !hasNonEmptyString(title)) {
      throw new Error("Toast requires a non-empty message or content.");
    }
  } else if (typeof content === "string" && !hasNonEmptyString(content)) {
    throw new Error("Toast content must not be an empty string.");
  }

  assertDuration(options.duration);
  assertValidTokens(options.tokens, documentRef);
  if (options.type !== undefined) {
    assertSemanticType(options.type);
  }

  const typePreset = options.type
    ? {
        role: SEMANTIC_ROLES[options.type],
        icon: SEMANTIC_ICONS[options.type],
        rootClassName: SEMANTIC_ROOT_CLASS_NAMES[options.type],
      }
    : null;

  const position = options.position ?? config.position;
  const role = options.role ?? preset?.role ?? typePreset?.role ?? DEFAULT_ROLE;
  assertToastPosition(position);
  assertToastRole(role);

  const margin = options.margin ?? config.margin;
  const dismissible = options.dismissible ?? options.closeButton ?? config.dismissible;
  const autoDismiss = options.autoDismiss ?? preset?.autoDismiss ?? config.autoDismiss;

  const resolvedTitle = hasNonEmptyString(title) ? title : null;
  const resolvedMessage = hasNonEmptyString(message) ? message : null;
  const resolvedDescription = hasNonEmptyString(description) ? description : null;

  return Object.freeze({
    instanceId: config.instanceId,
    autoDismiss,
    content: content === undefined ? null : resolveToastContent(content, documentRef, handle),
    duration: options.duration ?? config.duration,
    icon:
      content === undefined
        ? options.icon !== undefined
          ? options.icon
          : (preset?.icon ?? typePreset?.icon ?? null)
        : null,
    dismissible,
    title: content === undefined ? resolvedTitle : null,
    message: content === undefined ? resolvedMessage : null,
    description: content === undefined ? resolvedDescription : null,
    action: content === undefined ? (action ?? null) : null,
    position,
    role,
    rootClassName: preset?.rootClassName ?? typePreset?.rootClassName ?? DEFAULT_TOAST_CLASS,
    className: joinClassNames(config.className, options.className),
    instanceClassName: config.className,
    tokens: options.tokens ? { ...options.tokens } : null,
    margin: typeof margin === "object" && margin !== null ? { ...margin } : margin,
    dismissLabel: config.dismissLabel,
  });
}

/** A scoped token and/or extra-class update to apply to a live toast element. */
export interface LiveStyleUpdate {
  tokens?: ToastTokens;
  className?: string;
}

/**
 * Applies a scoped token and/or extra-class update to an already-rendered
 * toast element. Message, content, icon, and severity updates are handled
 * directly by `Toast` itself (see `toast-base.ts`), since they need to read
 * and mutate the toast's own current-state fields, not just the DOM.
 */
export function applyUpdateToElement(element: HTMLDivElement, update: LiveStyleUpdate): void {
  // Validate everything before mutating anything: a rejected update must be
  // atomic, not leave an earlier field in this same call already applied.
  if (update.tokens !== undefined) {
    assertValidTokens(update.tokens, element.ownerDocument);
  }

  if (update.tokens !== undefined) {
    replaceTokens(element.style, update.tokens);
  }

  if (update.className !== undefined) {
    // Replace only the per-call class portion — keep the root class and the
    // instance-level config default intact, so update() can't drop it.
    const dataClass = element.getAttribute("data-root-class") ?? "";
    const instanceClass = element.getAttribute("data-instance-class") ?? "";
    element.className = joinClassNames(dataClass, instanceClass, update.className);
  }
}
