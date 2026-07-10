/**
 * Toast notification positions on the viewport.
 */
export type ToastPosition =
  | "top-left"
  | "top-right"
  | "bottom-right"
  | "bottom-left"
  | "top-center"
  | "bottom-center"
  | "center";

/**
 * Accessibility roles for toast elements.
 */
export type ToastRole = "alert" | "status";

/**
 * Presets for icons embedded in semantic and loading toasts.
 */
export type ToastIcon = "success" | "error" | "warning" | "info" | "loader";

/**
 * Public lifecycle states of a toast notification.
 */
export type ToastState = "visible" | "hiding" | "hidden";

/**
 * Visual aesthetics configurations for toast notifications.
 */
export type ToastAppearance = "flat" | "soft" | "soft-bordered" | "left-accent";

/**
 * Design tokens for overriding colors per toast or globally per instance.
 */
export interface ToastTokens {
  /** Border/accent color for the toast-success variant. */
  success?: string;
  /** Foreground-on-accent color for the toast-success variant (used with filled/solid styles). */
  successContrast?: string;
  /** Muted background color for the toast-success variant. */
  successSubtle?: string;
  /** High-contrast foreground color for the toast-success variant. */
  successStrong?: string;
  /** Border/accent color for the toast-error variant. */
  destructive?: string;
  /** Foreground-on-accent color for the toast-error variant (used with filled/solid styles). */
  destructiveContrast?: string;
  /** Muted background color for the toast-error variant. */
  destructiveSubtle?: string;
  /** High-contrast foreground color for the toast-error variant. */
  destructiveStrong?: string;
  /** Border/accent color for the toast-warning variant. */
  warning?: string;
  /** Foreground-on-accent color for the toast-warning variant (used with filled/solid styles). */
  warningContrast?: string;
  /** Muted background color for the toast-warning variant. */
  warningSubtle?: string;
  /** High-contrast foreground color for the toast-warning variant. */
  warningStrong?: string;
  /** Border/accent color for the toast-info variant. */
  info?: string;
  /** Foreground-on-accent color for the toast-info variant (used with filled/solid styles). */
  infoContrast?: string;
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
  /** Background color for primary action buttons. */
  primary?: string;
  /** Foreground/contrast color for primary action buttons. */
  primaryContrast?: string;
  /** Hover background color for primary action buttons. */
  primaryHover?: string;
  /** Background color for secondary action buttons. */
  accent?: string;
  /** Foreground/contrast color for secondary action buttons. */
  accentContrast?: string;
  /** Hover background color for secondary action buttons. */
  accentHover?: string;
  /** Hover background color for success action buttons. */
  successHover?: string;
  /** Hover background color for destructive action buttons. */
  destructiveHover?: string;
}

/**
 * Options that can be dynamically updated on a live toast instance.
 */
export interface ToastUpdateOptions {
  /** The new message text. */
  message?: string;
  /** Scoped design token color overrides. */
  tokens?: ToastTokens;
  /** Extra CSS classes to append. */
  className?: string;
}

/**
 * Subscriber callback function signature for toast lifecycle events.
 */
export type ToastLifecycleSubscriber = (toast: unknown) => void;

/**
 * Control handle returned upon dispatching a toast notification.
 * Allows programmatic lifecycle management.
 */
export interface ToastHandle {
  /**
   * Programmatically dismisses the toast. Triggers exit animations.
   */
  dismiss(): void;

  /**
   * Patches the message text, styles, or classes of a live toast.
   *
   * @param options Partial updates to apply.
   */
  update(options: ToastUpdateOptions): void;

  /**
   * A promise that resolves when the toast has fully completed its
   * exit animation and has been removed from the DOM.
   */
  readonly settled: Promise<void>;

  /**
   * Current lifecycle state of the toast.
   */
  readonly state: ToastState;

  /**
   * Registers a callback to trigger when the toast is initially requested to show.
   *
   * @param subscriber Callback subscriber function.
   * @returns Unsubscribe function.
   */
  onShow(subscriber: ToastLifecycleSubscriber): () => void;

  /**
   * Registers a callback to trigger when the entrance animation completes.
   *
   * @param subscriber Callback subscriber function.
   * @returns Unsubscribe function.
   */
  onShown(subscriber: ToastLifecycleSubscriber): () => void;

  /**
   * Registers a callback to trigger when the toast begins to hide.
   *
   * @param subscriber Callback subscriber function.
   * @returns Unsubscribe function.
   */
  onHide(subscriber: ToastLifecycleSubscriber): () => void;

  /**
   * Registers a callback to trigger when the toast is fully removed from DOM.
   *
   * @param subscriber Callback subscriber function.
   * @returns Unsubscribe function.
   */
  onHidden(subscriber: ToastLifecycleSubscriber): () => void;
}

/**
 * Control handle returned by interactive (confirm / prompt / alert) modals.
 */
export interface InteractiveToastHandle<T> extends ToastHandle {
  /**
   * A promise that resolves with the user's input/decision:
   * - `confirm`: resolves with `boolean`.
   * - `prompt`: resolves with `string` (input value) or `null` (canceled).
   * - `alert`: resolves with `void` when acknowledged.
   */
  readonly result: Promise<T>;
}

/**
 * Union type representing the acceptable content values inside custom toasts.
 */
type ToastContentValue = string | Node;

/**
 * Supported formats for custom toast content. Can be a string, a DOM Node,
 * or a function returning either.
 */
export type ToastContent = ToastContentValue | (() => ToastContentValue);

/**
 * Options for dispatching a semantic notification (success/error/warning/info).
 */
export interface SemanticToastOptions {
  /** The message text to display. */
  message: string;
  /** Placement on the screen. Defaults to toaster configuration. */
  position?: ToastPosition;
  /** Visibility duration in milliseconds. Defaults to toaster configuration. */
  duration?: number;
  /** Whether to render a close button. Defaults to toaster configuration. */
  isDismissable?: boolean;
  /** Whether to automatically close after the duration. Defaults to toaster configuration. */
  shouldAutoDismiss?: boolean;
  /** Instance token overrides. */
  tokens?: ToastTokens;
  /** Extra CSS class name. */
  className?: string;
  /** Accessibility role. Defaults to variant default. */
  role?: ToastRole;
  /** Margin from the border of the viewport. Can be a CSS length (e.g. "24px", "1.5rem") or an object. */
  margin?: string | { x?: string; y?: string };
  /** Visual appearance style of the toast. */
  appearance?: ToastAppearance;
}

/**
 * Category names for predefined styles.
 */
export type SemanticType = "success" | "error" | "warning" | "info";

/**
 * Options for dispatching a loading toast notification.
 */
export interface LoadingToastOptions {
  /** The progress message. */
  message: string;
  /** Placement on the screen. Defaults to toaster configuration. */
  position?: ToastPosition;
  /** Whether the user can manually close it. Defaults to false. */
  isDismissable?: boolean;
  /** Color token overrides. */
  tokens?: ToastTokens;
  /** Extra CSS class name. */
  className?: string;
  /** Margin from the border of the viewport. Can be a CSS length (e.g. "24px", "1.5rem") or an object. */
  margin?: string | { x?: string; y?: string };
  /** Visual appearance style of the toast. */
  appearance?: ToastAppearance;
}

/**
 * Options for dispatching a custom layout toast.
 */
export interface CustomToastOptions {
  /** The custom HTML string, DOM Node, or creator function. */
  content: ToastContent;
  /** Placement on the screen. Defaults to toaster configuration. */
  position?: ToastPosition;
  /** Visibility duration in milliseconds. Defaults to toaster configuration. */
  duration?: number;
  /** Whether to render a close button. Defaults to toaster configuration. */
  isDismissable?: boolean;
  /** Whether to automatically close after duration. Defaults to toaster configuration. */
  shouldAutoDismiss?: boolean;
  /** Color token overrides. */
  tokens?: ToastTokens;
  /** Extra CSS class name. */
  className?: string;
  /** Accessibility role. Defaults to "status". */
  role?: ToastRole;
  /** Margin from the border of the viewport. Can be a CSS length (e.g. "24px", "1.5rem") or an object. */
  margin?: string | { x?: string; y?: string };
  /** Visual appearance style of the toast. */
  appearance?: ToastAppearance;
}

/**
 * Customization settings for interactive confirmation dialogs.
 */
export interface ConfirmOptions {
  /** Label for the positive action button. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Label for the negative action button. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Whether clicking the backdrop overlay cancels the modal. Defaults to false. */
  shouldBackdropDismiss?: boolean;
  /** Color token overrides. */
  tokens?: ToastTokens;
  /** Extra CSS class name. */
  className?: string;
  /** Color semantic type for the main action button. */
  type?: "primary" | "secondary" | "success" | "danger";
}

/**
 * Customization settings for interactive prompt input dialogs.
 */
export interface PromptOptions {
  /** Initial value prefilled in the text input field. */
  defaultValue?: string;
  /** Placeholder text when the input field is empty. */
  placeholder?: string;
  /** Label for the submit button. Defaults to "Submit". */
  submitLabel?: string;
  /** Label for the cancel button. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Whether clicking the backdrop overlay cancels the modal. Defaults to false. */
  shouldBackdropDismiss?: boolean;
  /** Color token overrides. */
  tokens?: ToastTokens;
  /** Extra CSS class name. */
  className?: string;
  /** Color semantic type for the main action button. */
  type?: "primary" | "secondary" | "success" | "danger";
}

/**
 * Customization settings for blocking alert dialogs.
 */
export interface AlertOptions {
  /** Label for the confirmation button. Defaults to "OK". */
  okLabel?: string;
  /** Whether clicking the backdrop overlay closes the alert. Defaults to true. */
  shouldBackdropDismiss?: boolean;
  /** Color token overrides. */
  tokens?: ToastTokens;
  /** Extra CSS class name. */
  className?: string;
  /** Color semantic type for the main action button. */
  type?: "primary" | "secondary" | "success" | "danger";
}

/**
 * Fallback defaults for semantic toasts.
 */
export interface SemanticDefaults {
  /** Default screen placement for semantic toasts. */
  position?: ToastPosition;
  /** Default duration in milliseconds before auto-dismissal. */
  duration?: number;
  /** Whether semantic toasts show a close button by default. */
  isDismissable?: boolean;
  /** Whether semantic toasts automatically dismiss after duration. */
  shouldAutoDismiss?: boolean;
}

/**
 * Fallback defaults for loading toasts.
 */
export interface LoadingDefaults {
  /** Default screen placement for loading toasts. */
  position?: ToastPosition;
  /** Whether loading toasts show a close button by default. */
  isDismissable?: boolean;
}

/**
 * Fallback defaults for custom toasts.
 */
export interface CustomDefaults {
  /** Default screen placement for custom toasts. */
  position?: ToastPosition;
  /** Default duration in milliseconds before auto-dismissal. */
  duration?: number;
  /** Whether custom toasts show a close button by default. */
  isDismissable?: boolean;
  /** Whether custom toasts automatically dismiss after duration. */
  shouldAutoDismiss?: boolean;
}

/**
 * Global configuration settings for a Toaster manager instance.
 */
export interface ToasterConfig {
  /** Default viewport position. Defaults to "top-right". */
  position?: ToastPosition;
  /** Parent DOM element receiving container stacks. Defaults to document.body. */
  container?: HTMLElement;
  /** Maximum active toasts displayed simultaneously. Defaults to 5. */
  maxVisible?: number;
  /** Default timeout in milliseconds. Defaults to 4000. */
  duration?: number;
  /** Render close button by default. Defaults to false. */
  isDismissable?: boolean;
  /** Dismiss automatically when duration expires by default. Defaults to true. */
  shouldAutoDismiss?: boolean;
  /** Dynamic CSS variables applied to all toasts inside this instance. */
  tokens?: ToastTokens;
  /** Scoped fallback overrides per notification type. */
  semantic?: SemanticDefaults;
  loading?: LoadingDefaults;
  custom?: CustomDefaults;
  /** Margin from the border of the viewport. Can be a CSS length (e.g. "24px", "1.5rem") or an object. */
  margin?: string | { x?: string; y?: string };
  /** Default visual appearance style for toasts. */
  appearance?: ToastAppearance;
}
