type ToastContentValue = string | Node;
type ToastContent = ToastContentValue | (() => ToastContentValue);

/** Built-in marker names rendered before plain toast messages. */
export type ToastIcon = "success" | "error" | "warning" | "info" | "loader";

/** Shared rendering, timing, accessibility, and placement options for toast variants. */
interface ToastBaseOptions {
  /** Auto-dismiss delay in milliseconds. Must be a finite number >= 0. */
  duration?: number;
  /** Whether to render a dismiss button. Defaults to `false`. */
  isDismissable?: boolean;
  /** Whether to hide automatically after entry animation and duration. Defaults to `true`. */
  autoDismiss?: boolean;
  /** Leading icon rendered before `message`. Ignored when `content` is set. */
  icon?: ToastIcon;
  /** Screen corner containing the toast stack. Defaults to `top-right`. */
  position?: "top-left" | "top-right" | "bottom-right" | "bottom-left";
  /**
   * Plain-text message. Ignored when `content` is set.
   */
  message?: string;
  /**
   * Custom content: any DOM Node, a factory function returning one, or a
   * non-blank trusted HTML string. Empty nodes and fragments are accepted. When
   * provided, `message` is ignored.
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
  /** Live-region urgency for a base toast. Defaults to `status`. */
  role?: "alert" | "status";
  /** Classes appended to the variant's root classes. */
  className?: string;
}

/**
 * Public toast options requiring a non-blank message, non-blank string content,
 * or any DOM Node content. String content is trusted HTML; messages are plain
 * text.
 */
export type ToastOptions =
  | (ToastBaseOptions & { message: string; content?: ToastContent })
  | (ToastBaseOptions & { message?: string; content: ToastContent });
