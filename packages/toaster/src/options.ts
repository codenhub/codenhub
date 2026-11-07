import type {
  SemanticType,
  ToastAction,
  ToastContent,
  ToastHandle,
  ToastIcon,
  ToastPosition,
  ToastRole,
} from "./types";

/** Built-in text this package renders with no per-call override of its own -- see `ToastLabels.dismiss`. */
export const DEFAULT_DISMISS_LABEL = "Dismiss toast";

/** Accessible name of a toast stack's region -- see `ToastLabels.notifications`. */
export const DEFAULT_REGION_LABEL = "Notifications";

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
  /** Extra CSS class name applied to every toast from this instance. */
  readonly className?: string;
  /** Accessible label for a toast's dismiss button. */
  readonly dismissLabel: string;
  /** Accessible name of each toast stack's region landmark. */
  readonly regionLabel: string;
}

export const DEFAULT_CONFIG: Omit<ResolvedToastConfig, "instanceId" | "margin" | "dismissLabel" | "regionLabel"> = {
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
export const TOAST_SHAPE_CLASS = "toaster-toast";

/**
 * Full root class for the default (custom/no-variant) toast.
 * Used as the fallback when no variant-specific rootClassName is provided.
 */
export const DEFAULT_TOAST_CLASS = `${TOAST_SHAPE_CLASS} toaster-toast-default`;

/**
 * Shared severity mappings for the four semantic categories, used both by
 * `SemanticToast`'s construction-time preset (see `variants/semantic.ts`)
 * and by `Toast.update()`'s `type` field so a toast can switch severity
 * after it has already been dispatched (e.g. a loading toast completing
 * into a success toast).
 */
export const SEMANTIC_ROOT_CLASS_NAMES: Record<SemanticType | "default", string> = {
  success: `${TOAST_SHAPE_CLASS} toaster-toast-success`,
  error: `${TOAST_SHAPE_CLASS} toaster-toast-error`,
  warning: `${TOAST_SHAPE_CLASS} toaster-toast-warning`,
  info: `${TOAST_SHAPE_CLASS} toaster-toast-info`,
  default: `${TOAST_SHAPE_CLASS} toaster-toast-default`,
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
   *  `applyClassNameUpdate`). */
  readonly instanceClassName?: string;
  readonly margin?: string | { x?: string; y?: string };
  /** Accessible label for this toast's dismiss button, from `ResolvedToastConfig.dismissLabel`. */
  readonly dismissLabel: string;
  /** Accessible name of the stack this toast renders in, from `ResolvedToastConfig.regionLabel`. */
  readonly regionLabel: string;
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

/**
 * A copy of `options` without its `undefined` entries, so spreading it over
 * defaults treats `{ position: undefined }` as unset instead of erasing the
 * default.
 */
export function withoutUndefined<T extends object>(options: T): T {
  return Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)) as T;
}

export function joinClassNames(...classNames: Array<string | undefined>): string {
  return classNames.filter((c): c is string => hasNonEmptyString(c)).join(" ");
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
    return Object.freeze([documentRef.createTextNode(resolved)]);
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
  autoDismiss?: boolean;
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
  if (options.type !== undefined) {
    assertSemanticType(options.type);
  }

  const { type } = options;
  const position = options.position ?? config.position;
  const role = options.role ?? preset?.role ?? (type ? SEMANTIC_ROLES[type] : DEFAULT_ROLE);
  assertToastPosition(position);
  assertToastRole(role);

  const margin = options.margin ?? config.margin;
  const dismissible = options.dismissible ?? config.dismissible;
  const autoDismiss = options.autoDismiss ?? preset?.autoDismiss ?? config.autoDismiss;

  // Content and message/icon are mutually exclusive.
  const isMessageToast = content === undefined;

  return Object.freeze({
    instanceId: config.instanceId,
    autoDismiss,
    content: isMessageToast ? null : resolveToastContent(content, documentRef, handle),
    duration: options.duration ?? config.duration,
    icon: !isMessageToast
      ? null
      : options.icon !== undefined
        ? options.icon
        : (preset?.icon ?? (type ? SEMANTIC_ICONS[type] : null)),
    dismissible,
    title: isMessageToast && hasNonEmptyString(title) ? title : null,
    message: isMessageToast && hasNonEmptyString(message) ? message : null,
    description: isMessageToast && hasNonEmptyString(description) ? description : null,
    action: isMessageToast ? (action ?? null) : null,
    position,
    role,
    rootClassName: preset?.rootClassName ?? (type ? SEMANTIC_ROOT_CLASS_NAMES[type] : DEFAULT_TOAST_CLASS),
    className: joinClassNames(config.className, options.className),
    instanceClassName: config.className,
    margin: typeof margin === "object" && margin !== null ? { ...margin } : margin,
    dismissLabel: config.dismissLabel,
    regionLabel: config.regionLabel,
  });
}

/**
 * Applies an `update({ className })` to an already-rendered toast element,
 * replacing only the per-call class portion: the root class and the
 * instance-level config default stay, so `update()` cannot drop them.
 */
export function applyClassNameUpdate(element: HTMLDivElement, className: string): void {
  const dataClass = element.getAttribute("data-root-class") ?? "";
  const instanceClass = element.getAttribute("data-instance-class") ?? "";
  element.className = joinClassNames(dataClass, instanceClass, className);
}
