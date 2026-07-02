type ToastContentValue = string | Node;
type ToastContent = ToastContentValue | (() => ToastContentValue);

export type ToastIcon = "success" | "error" | "warning" | "info" | "loader";
export type ToastPosition = "top-left" | "top-right" | "bottom-right" | "bottom-left";
export type ToastRole = "alert" | "status";

export interface ToastBaseOptions {
  /** Auto-dismiss delay in milliseconds. Must be a finite number >= 0. */
  duration?: number;
  /** Whether to render a dismiss button. Defaults to `false`. */
  isDismissable?: boolean;
  /** Whether the toast should automatically dismiss. Defaults to `true`. */
  autoDismiss?: boolean;
  /** Leading icon rendered before message. Ignored when content is set. */
  icon?: ToastIcon;
  /** Screen position of the toast. */
  position?: ToastPosition;
  /** Plain-text message. Ignored when content is set. */
  message?: string;
  /** Custom content (string HTML or DOM nodes). Takes precedence over message. */
  content?: ToastContent;
  /** Accessibility role. */
  role?: ToastRole;
  /** Additional wrapper classes. */
  className?: string;
}

export type ToastOptions =
  | (ToastBaseOptions & { message: string; content?: ToastContent })
  | (ToastBaseOptions & { message?: string; content: ToastContent });

export interface ConfirmToastOptions extends Omit<
  ToastBaseOptions,
  "message" | "content" | "autoDismiss" | "isDismissable"
> {
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface PromptToastOptions extends Omit<
  ToastBaseOptions,
  "message" | "content" | "autoDismiss" | "isDismissable"
> {
  submitLabel?: string;
  cancelLabel?: string;
  placeholder?: string;
}

export interface AlertToastOptions extends Omit<
  ToastBaseOptions,
  "message" | "content" | "autoDismiss" | "isDismissable"
> {
  okLabel?: string;
}
