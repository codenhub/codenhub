import { buildInlineStyle } from "./tokens";
import type { ToastContent, ToastIcon, ToastPosition, ToastRole, ToastTokens, ToastUpdateOptions } from "./types";

export interface ResolvedToastConfig {
  readonly position: ToastPosition;
  readonly duration: number;
  readonly isDismissable: boolean;
  readonly autoDismiss: boolean;
  readonly maxVisible: number;
}

export const DEFAULT_CONFIG: ResolvedToastConfig = {
  position: "top-right",
  duration: 4000,
  isDismissable: false,
  autoDismiss: true,
  maxVisible: 5,
};

export const DEFAULT_ROLE: ToastRole = "status";

export const TOAST_SHAPE_CLASS =
  "rounded-xl border-2 text-sm font-medium font-default pointer-events-auto flex items-center";

export const DEFAULT_TOAST_CLASS = `${TOAST_SHAPE_CLASS} min-w-40 p-3 gap-2 toast-default`;

// --- Normalized options used internally by Toast ----------------------------

export interface NormalizedToastOptions {
  readonly autoDismiss: boolean;
  readonly content: readonly Node[] | null;
  readonly duration: number;
  readonly icon: ToastIcon | null;
  readonly isDismissable: boolean;
  readonly message: string | null;
  readonly position: ToastPosition;
  readonly role: ToastRole;
  readonly rootClassName: string;
  readonly tokens: ToastTokens | null;
}

export interface ToastPresetOptions {
  readonly defaultAutoDismiss?: boolean;
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

function resolveToastContent(content: ToastContent): readonly Node[] {
  const resolved = typeof content === "function" ? content() : content;

  if (typeof resolved === "string") {
    if (!hasNonEmptyString(resolved)) {
      throw new Error("Toast content must not be an empty string.");
    }
    const template = document.createElement("template");
    template.innerHTML = resolved;
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
  autoDismiss?: boolean;
  tokens?: ToastTokens;
  className?: string;
  role?: ToastRole;
}

export function normalizeToastOptions(
  options: RawToastOptions,
  preset: ToastPresetOptions | null,
  config: ResolvedToastConfig,
): Readonly<NormalizedToastOptions> {
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
    autoDismiss: options.autoDismiss ?? preset?.defaultAutoDismiss ?? config.autoDismiss,
    content: content === undefined ? null : resolveToastContent(content),
    duration: options.duration ?? config.duration,
    icon: content === undefined ? (preset?.icon ?? options.icon ?? null) : null,
    isDismissable: options.isDismissable ?? config.isDismissable,
    message: content === undefined ? (message ?? "") : null,
    position: options.position ?? config.position,
    role: preset?.role ?? options.role ?? DEFAULT_ROLE,
    rootClassName: joinClassNames(preset?.rootClassName ?? DEFAULT_TOAST_CLASS, options.className),
    tokens: options.tokens ?? null,
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
