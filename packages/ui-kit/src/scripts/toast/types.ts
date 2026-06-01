type ToastContentValue = string | Node;
type ToastContent = ToastContentValue | (() => ToastContentValue);

export type ToastIcon = "success" | "error" | "warning" | "info" | "loader";

interface ToastBaseOptions {
  /** Auto-dismiss delay in milliseconds. Must be a finite number >= 0. */
  duration?: number;
  /** Whether to render a dismiss button. Defaults to `false`. */
  isDismissable?: boolean;
  autoDismiss?: boolean;
  /** Leading icon rendered before `message`. Ignored when `content` is set. */
  icon?: ToastIcon;
  position?: "top-left" | "top-right" | "bottom-right" | "bottom-left";
  /**
   * Plain-text message. Ignored when `content` is set.
   */
  message?: string;
  /**
   * Custom content: a DOM Node, a factory function returning one, or trusted
   * HTML. When provided, `message` is ignored.
   *
   * DOM nodes are moved into the toast so live listeners and state keep
   * working. If you need reusable markup for multiple toast instances, pass a
   * factory that returns a fresh node tree.
   *
   * Factories are resolved during construction so invalid content fails early.
   *
   * Security: string values are inserted via `innerHTML`. Only pass trusted
   * markup; never pass unsanitized user input.
   */
  content?: ToastContent;
  role?: "alert" | "status";
  className?: string;
}

/**
 * Toasts must provide at least one user-facing content source.
 */
export type ToastOptions =
  | (ToastBaseOptions & { message: string; content?: ToastContent })
  | (ToastBaseOptions & { message?: string; content: ToastContent });
