// Position and a11y roles
export type ToastPosition = "top-left" | "top-right" | "bottom-right" | "bottom-left";
export type ToastRole = "alert" | "status";
export type ToastIcon = "success" | "error" | "warning" | "info" | "loader";
export type ToastState = "visible" | "hiding" | "hidden";

// --- Token overrides ---------------------------------------------------------

export interface ToastTokens {
  /** Border/accent color for the toast-success variant. */
  success?: string;
  /** Muted background color for the toast-success variant. */
  successSubtle?: string;
  /** High-contrast foreground color for the toast-success variant. */
  successStrong?: string;
  /** Border/accent color for the toast-error variant. */
  destructive?: string;
  /** Muted background color for the toast-error variant. */
  destructiveSubtle?: string;
  /** High-contrast foreground color for the toast-error variant. */
  destructiveStrong?: string;
  /** Border/accent color for the toast-warning variant. */
  warning?: string;
  /** Muted background color for the toast-warning variant. */
  warningSubtle?: string;
  /** High-contrast foreground color for the toast-warning variant. */
  warningStrong?: string;
  /** Border/accent color for the toast-info variant. */
  info?: string;
  /** Muted background color for the toast-info variant. */
  infoSubtle?: string;
  /** High-contrast foreground color for the toast-info variant. */
  infoStrong?: string;
  /** Border color for the toast-default variant. */
  border?: string;
  /** Background color for the toast-default variant. */
  surface?: string;
  /** Text color for the toast-default variant. */
  text?: string;
}

// --- Public handle (returned from every show method) -------------------------

/** Options that can be updated on a live toast. */
export interface ToastUpdateOptions {
  message?: string;
  tokens?: ToastTokens;
  className?: string;
}

/** Control object returned by every show call. */
export interface ToastHandle {
  /** Programmatically dismiss the toast. */
  dismiss(): void;
  /** Update message / tokens / className on a live toast. */
  update(options: ToastUpdateOptions): void;
  /** Resolves when the toast has fully hidden and removed from DOM. */
  readonly settled: Promise<void>;
  /** Current lifecycle state. */
  readonly state: ToastState;
}

/**
 * Extended handle returned by interactive (confirm / prompt / alert) toasts.
 * `result` resolves with the user response. Calling `dismiss()` resolves it
 * with the cancel value (false / null / undefined).
 */
export interface InteractiveToastHandle<T> extends ToastHandle {
  readonly result: Promise<T>;
}

// --- Per-call option types ---------------------------------------------------

type ToastContentValue = string | Node;
export type ToastContent = ToastContentValue | (() => ToastContentValue);

export interface SemanticToastOptions {
  message: string;
  position?: ToastPosition;
  duration?: number;
  isDismissable?: boolean;
  autoDismiss?: boolean;
  tokens?: ToastTokens;
  className?: string;
  role?: ToastRole;
}

export type SemanticType = "success" | "error" | "warning" | "info";

export interface LoadingToastOptions {
  message: string;
  position?: ToastPosition;
  /** Defaults to false - loading toasts do not auto-dismiss. */
  isDismissable?: boolean;
  tokens?: ToastTokens;
  className?: string;
}

export interface CustomToastOptions {
  content: ToastContent;
  position?: ToastPosition;
  duration?: number;
  isDismissable?: boolean;
  autoDismiss?: boolean;
  tokens?: ToastTokens;
  className?: string;
  role?: ToastRole;
}

export interface ConfirmOptions {
  confirmLabel?: string;
  cancelLabel?: string;
  /** Dismiss (cancel) when the backdrop is clicked. Defaults to false. */
  backdropDismiss?: boolean;
  tokens?: ToastTokens;
  className?: string;
}

export interface PromptOptions {
  defaultValue?: string;
  placeholder?: string;
  submitLabel?: string;
  cancelLabel?: string;
  /** Dismiss (cancel) when the backdrop is clicked. Defaults to false. */
  backdropDismiss?: boolean;
  tokens?: ToastTokens;
  className?: string;
}

export interface AlertOptions {
  okLabel?: string;
  /** Dismiss when the backdrop is clicked. Defaults to true. */
  backdropDismiss?: boolean;
  tokens?: ToastTokens;
  className?: string;
}

// --- Category-level defaults (inside ToasterConfig) -------------------------

export interface SemanticDefaults {
  position?: ToastPosition;
  duration?: number;
  isDismissable?: boolean;
  autoDismiss?: boolean;
}

export interface LoadingDefaults {
  position?: ToastPosition;
  isDismissable?: boolean;
}

export interface CustomDefaults {
  position?: ToastPosition;
  duration?: number;
  isDismissable?: boolean;
  autoDismiss?: boolean;
}

// --- Toaster config ----------------------------------------------------------

export interface ToasterConfig {
  /** Default position for all toasts. Defaults to "top-right". */
  position?: ToastPosition;
  /** Parent element that receives toast stack containers. Defaults to document.body. */
  container?: HTMLElement;
  /** Maximum number of simultaneously visible toasts. Defaults to 5. */
  maxVisible?: number;
  /** Default auto-dismiss duration in milliseconds. Defaults to 4000. */
  duration?: number;
  /** Show a dismiss button by default. Defaults to false. */
  isDismissable?: boolean;
  /** Auto-dismiss toasts by default. Defaults to true. */
  autoDismiss?: boolean;
  /** Global CSS token overrides applied to all toasts. */
  tokens?: ToastTokens;
  /** Per-category defaults that override the top-level defaults. */
  semantic?: SemanticDefaults;
  loading?: LoadingDefaults;
  custom?: CustomDefaults;
}
