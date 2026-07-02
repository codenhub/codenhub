import type { ToastIcon, ToastOptions, ToastPosition, ToastRole } from "./types";

type ToastContent = NonNullable<ToastOptions["content"]>;

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
}

export interface ToastPresetOptions {
  readonly defaultAutoDismiss?: boolean;
  readonly icon?: ToastIcon;
  readonly role?: ToastRole;
  readonly rootClassName?: string;
}

const DEFAULT_DURATION = 4000;
const DEFAULT_POSITION: ToastPosition = "top-right";
const DEFAULT_ROLE: ToastRole = "status";
const DEFAULT_AUTO_DISMISS = true;
const DEFAULT_IS_DISMISSABLE = false;
const TOAST_SHAPE_CLASS_NAME =
  "rounded-xl border-2 text-sm font-medium font-default pointer-events-auto flex items-center";
const DEFAULT_ROOT_CLASS_NAME = `${TOAST_SHAPE_CLASS_NAME} min-w-40 p-3 gap-2 toast-default`;

function hasNonEmptyString(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function assertToastHasContent(options: ToastOptions): void {
  if (options.content !== undefined) {
    if (typeof options.content !== "string" || hasNonEmptyString(options.content)) {
      return;
    }
    throw new Error("Toast content must not be an empty string.");
  }

  if (hasNonEmptyString(options.message)) {
    return;
  }
  throw new Error("Toast requires a non-empty message or content.");
}

function assertToastDuration(duration: number | undefined): void {
  if (duration === undefined) {
    return;
  }
  if (!Number.isFinite(duration) || duration < 0) {
    throw new Error("Toast duration must be a finite number greater than or equal to 0.");
  }
}

function joinClassNames(...classNames: Array<string | undefined>): string {
  return classNames.filter((className): className is string => hasNonEmptyString(className)).join(" ");
}

function resolveToastContent(content: ToastContent): readonly Node[] {
  const resolvedContent = typeof content === "function" ? content() : content;

  if (typeof resolvedContent === "string") {
    if (!hasNonEmptyString(resolvedContent)) {
      throw new Error("Toast content must not be an empty string.");
    }
    const template = document.createElement("template");
    template.innerHTML = resolvedContent;
    return Object.freeze(Array.from(template.content.childNodes));
  }

  if (!(resolvedContent instanceof Node)) {
    throw new Error("Toast content must resolve to a string or DOM Node.");
  }

  if (resolvedContent instanceof DocumentFragment) {
    return Object.freeze(Array.from(resolvedContent.childNodes));
  }

  return Object.freeze([resolvedContent]);
}

export function normalizeToastOptions(
  options: ToastOptions,
  preset: ToastPresetOptions | null,
): Readonly<NormalizedToastOptions> {
  const content = options.content;

  assertToastHasContent(options);
  assertToastDuration(options.duration);

  return Object.freeze({
    autoDismiss: options.autoDismiss ?? preset?.defaultAutoDismiss ?? DEFAULT_AUTO_DISMISS,
    content: content === undefined ? null : resolveToastContent(content),
    duration: options.duration ?? DEFAULT_DURATION,
    icon: content === undefined ? (preset?.icon ?? options.icon ?? null) : null,
    isDismissable: options.isDismissable ?? DEFAULT_IS_DISMISSABLE,
    message: content === undefined ? (options.message ?? "") : null,
    position: options.position ?? DEFAULT_POSITION,
    role: preset?.role ?? options.role ?? DEFAULT_ROLE,
    rootClassName: joinClassNames(preset?.rootClassName ?? DEFAULT_ROOT_CLASS_NAME, options.className),
  });
}
