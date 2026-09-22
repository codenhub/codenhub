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
export type ToastState = "queued" | "visible" | "hiding" | "hidden";

/**
 * Design tokens for overriding colors per toast or globally per instance.
 *
 * Every color here is final -- a background, a border, or a foreground exactly
 * as it renders -- never an ingredient this package mixes further. Unset, each
 * one already matches `@codenhub/styles`' own real, composed look (its
 * `./palette` export when that package is around, this package's own
 * generated defaults when it is not); setting one only replaces that single
 * final value.
 */
export interface ToastTokens {
  /** Background color for the toast-success variant. */
  successBg?: string;
  /** Foreground (text/icon) color for the toast-success variant. */
  successFg?: string;
  /** Border color for the toast-success variant. */
  successEdge?: string;
  /** Background color for the toast-error variant. */
  errorBg?: string;
  /** Foreground (text/icon) color for the toast-error variant. */
  errorFg?: string;
  /** Border color for the toast-error variant. */
  errorEdge?: string;
  /** Background color for the toast-warning variant. */
  warningBg?: string;
  /** Foreground (text/icon) color for the toast-warning variant. */
  warningFg?: string;
  /** Border color for the toast-warning variant. */
  warningEdge?: string;
  /** Background color for the toast-info variant. */
  infoBg?: string;
  /** Foreground (text/icon) color for the toast-info variant. */
  infoFg?: string;
  /** Border color for the toast-info variant. */
  infoEdge?: string;
  /** Background color for the toast-default (no-severity) variant. */
  defaultBg?: string;
  /** Foreground (text/icon) color for the toast-default (no-severity) variant. */
  defaultFg?: string;
  /** Border color for the toast-default (no-severity) variant. */
  defaultEdge?: string;
  /** Border color for the dialog container, cancel button, and input. */
  border?: string;
  /** Background color for the dialog container and cancel button. */
  surface?: string;
  /** Text color for the dialog container and cancel button. */
  text?: string;
  /** Background color for the primary dialog action button. */
  primaryBg?: string;
  /** Foreground color for the primary dialog action button. */
  primaryFg?: string;
  /** Hover background color for the primary dialog action button. */
  primaryBgHover?: string;
  /** Border color for the primary dialog action button when `.edged` is active. */
  primaryEdge?: string;
  /** Background color for the secondary dialog action button. */
  secondaryBg?: string;
  /** Foreground color for the secondary dialog action button. */
  secondaryFg?: string;
  /** Hover background color for the secondary dialog action button. */
  secondaryBgHover?: string;
  /** Border color for the secondary dialog action button when `.edged` is active. */
  secondaryEdge?: string;
  /** Background color for the success dialog action button. */
  successBtnBg?: string;
  /** Foreground color for the success dialog action button. */
  successBtnFg?: string;
  /** Hover background color for the success dialog action button. */
  successBtnBgHover?: string;
  /** Border color for the success dialog action button when `.edged` is active. */
  successBtnEdge?: string;
  /** Background color for the error dialog action button. */
  errorBtnBg?: string;
  /** Foreground color for the error dialog action button. */
  errorBtnFg?: string;
  /** Hover background color for the error dialog action button. */
  errorBtnBgHover?: string;
  /** Border color for the error dialog action button when `.edged` is active. */
  errorBtnEdge?: string;
}

/**
 * Inline action button rendered inside a toast notification.
 */
export interface ToastAction {
  /** Text label displayed on the action button. */
  label: string;
  /**
   * Callback invoked when the user clicks the action button.
   * To close the toast upon action execution, call `handle.dismiss()`.
   */
  onClick: (event: MouseEvent, handle: ToastHandle) => void;
}

/**
 * Options that can be dynamically updated on a live toast instance.
 */
export interface ToastUpdateOptions {
  /** Optional title to replace on the toast, or `null` to remove it. */
  title?: string | null;
  /**
   * The new message text. Ignored if `content` is also given in this same
   * call; has no effect on a toast that was built from `content` rather
   * than `message` (there is no message slot to write into). Pass `null` to remove it.
   */
  message?: string | null;
  /** Optional secondary description text below the message or title, or `null` to remove it. */
  description?: string | null;
  /** Replaces or removes the inline action button (`null` removes it). */
  action?: ToastAction | null;
  /**
   * Replaces the toast's content entirely. Follows the same rules as
   * construction: a string is sanitized, a DOM node is trusted and used
   * as-is. Supersedes `message` and `icon` in this same call, the same
   * mutual exclusivity construction itself applies.
   */
  content?: ToastContent;
  /**
   * Swaps the icon glyph, or `null` to remove it. Ignored in a call that
   * also gives `content`. If `type` is given in the same call and `icon`
   * is not, the icon matching that type is used automatically.
   */
  icon?: ToastIcon | null;
  /**
   * Switches the toast's severity color and accessibility role to match --
   * the same success/error/warning/info categories a semantic toast is
   * dispatched with -- so e.g. a loading toast can complete into a success
   * toast: `update({ type: "success" })`.
   */
  type?: SemanticType | "default";
  /** New visibility duration in milliseconds, applied the next time an auto-dismiss timer would run. */
  duration?: number;
  /** Enables or disables automatic dismissal after `duration`. */
  autoDismiss?: boolean;
  /** Enables or disables the dismiss button. */
  dismissible?: boolean;
  /** Intuitive alias for `dismissible`. */
  closeButton?: boolean;
  /** Scoped design token color overrides. */
  tokens?: ToastTokens;
  /** Extra CSS classes to append. */
  className?: string;
}

/**
 * Subscriber callback function signature for toast lifecycle events.
 */
export type ToastLifecycleSubscriber = (handle: ToastHandle) => void;

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
   * Patches the message, content, icon, severity, timing, styles, or
   * classes of a toast. Applied immediately when the toast is visible; if
   * it is still queued, the update is stored and applied once a slot
   * opens rather than discarded. Has no effect once the toast has settled.
   *
   * @param options Partial updates to apply.
   * @throws {Error} If `options.tokens` contains an invalid CSS color,
   *   `options.duration` is not a finite number >= 0, `options.type` is
   *   not a recognized severity, or `options.content` resolves to nothing
   *   renderable.
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
 * Implements `PromiseLike<T>` so callers can directly `await dialog.confirm(...)`
 * while retaining access to control methods (`dismiss`, `state`, `settled`).
 */
export interface InteractiveToastHandle<T> extends PromiseLike<T> {
  /**
   * Attaches callbacks for the resolution and/or rejection of the dialog result.
   */
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;

  /**
   * Attaches a callback for only the rejection of the dialog result.
   */
  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<T | TResult>;

  /**
   * Attaches a callback that is executed when the dialog result is settled.
   */
  finally(onfinally?: (() => void) | null): Promise<T>;

  /** Dismisses an active or queued dialog. Safe to call more than once. */
  dismiss(): void;

  /** Resolves after the dialog leaves the top layer and cleanup completes. */
  readonly settled: Promise<void>;

  /** Current queue and visibility state of the dialog. */
  readonly state: ToastState;

  /**
   * A promise that resolves with the user's input/decision:
   * - `confirm`: resolves with `boolean`.
   * - `prompt`: resolves with `string` (input value) or `null` (canceled).
   * - `alert`: resolves with `void` when acknowledged.
   */
  readonly result: Promise<T>;
}

/**
 * Supported custom content. Strings are sanitized by the package. DOM nodes
 * are trusted application-owned content and are inserted without sanitizing.
 * Can also be a function receiving the `ToastHandle` or returning content directly.
 */
export type ToastContent = string | Node | ((handle: ToastHandle) => string | Node) | (() => string | Node);

/**
 * Options for dispatching standard toast notifications.
 */
export interface ToastOptions {
  /** Optional title to display above the message or as primary heading. */
  title?: string;
  /** The message text to display. */
  message?: string;
  /** Optional secondary description text below the message or title. */
  description?: string;
  /** Optional inline action button control. */
  action?: ToastAction;
  /** Placement on the screen. Defaults to toaster configuration. */
  position?: ToastPosition;
  /** Visibility duration in milliseconds. Defaults to toaster configuration. */
  duration?: number;
  /** Whether to render a close button. Defaults to toaster configuration. */
  dismissible?: boolean;
  /** Intuitive alias for `dismissible`. */
  closeButton?: boolean;
  /** Whether to automatically close after the duration. Defaults to toaster configuration. */
  autoDismiss?: boolean;
  /** Instance token overrides. */
  tokens?: ToastTokens;
  /** Extra CSS class name. */
  className?: string;
  /** Accessibility role. Defaults to variant default. */
  role?: ToastRole;
  /**
   * Margin from the border of the viewport. Can be a CSS length (e.g.
   * "24px", "1.5rem") or an object. This is a property of the shared stack
   * at this position, not of an individual toast: the most recent explicit
   * value dispatched to a given position applies to every toast already
   * showing there, and a dispatch that omits it leaves the stack's current
   * margin unchanged. Toasts at the same position always share one margin.
   */
  margin?: string | { x?: string; y?: string };
  /** Severity variant or "default" neutral. */
  type?: SemanticType | "default";
  /** Icon glyph override, or `null` to render no icon. */
  icon?: ToastIcon | null;
}

/**
 * Options for dispatching a semantic notification (success/error/warning/info).
 */
export type SemanticToastOptions = ToastOptions;

/**
 * Category names for predefined styles.
 */
export type SemanticType = "success" | "error" | "warning" | "info";

/**
 * Options for dispatching a loading toast notification.
 */
export interface LoadingToastOptions {
  /** Optional title to display above the progress message. */
  title?: string;
  /** The progress message. */
  message?: string;
  /** Optional secondary description text below the progress message. */
  description?: string;
  /** Placement on the screen. Defaults to toaster configuration. */
  position?: ToastPosition;
  /** Whether the user can manually close it. Defaults to false. */
  dismissible?: boolean;
  /** Intuitive alias for `dismissible`. */
  closeButton?: boolean;
  /** Color token overrides. */
  tokens?: ToastTokens;
  /** Extra CSS class name. */
  className?: string;
  /**
   * Margin from the border of the viewport. Can be a CSS length (e.g.
   * "24px", "1.5rem") or an object.
   */
  margin?: string | { x?: string; y?: string };
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
  dismissible?: boolean;
  /** Intuitive alias for `dismissible`. */
  closeButton?: boolean;
  /** Whether to automatically close after duration. Defaults to toaster configuration. */
  autoDismiss?: boolean;
  /** Color token overrides. */
  tokens?: ToastTokens;
  /** Extra CSS class name. */
  className?: string;
  /** Accessibility role. Defaults to "status". */
  role?: ToastRole;
  /**
   * Margin from the border of the viewport. Can be a CSS length (e.g.
   * "24px", "1.5rem") or an object.
   */
  margin?: string | { x?: string; y?: string };
}

/**
 * Customization settings for interactive confirmation dialogs.
 */
export interface ConfirmOptions {
  /** Optional title to display above the message. */
  title?: string;
  /** Label for the positive action button. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Label for the negative action button. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Whether clicking the backdrop overlay cancels the modal. Defaults to true. */
  backdropDismiss?: boolean;
  /** Deprecated alias for `backdropDismiss`. */
  shouldBackdropDismiss?: boolean;
  /** Color token overrides. */
  tokens?: ToastTokens;
  /** Extra CSS class name. */
  className?: string;
  /** Color semantic type for the main action button. */
  type?: "primary" | "secondary" | "success" | "error";
}

/**
 * Customization settings for interactive prompt input dialogs.
 */
export interface PromptOptions {
  /** Optional title to display above the message. */
  title?: string;
  /** Initial value prefilled in the text input field. */
  defaultValue?: string;
  /** Placeholder text when the input field is empty. */
  placeholder?: string;
  /** Label for the submit button. Defaults to "Submit". */
  submitLabel?: string;
  /** Label for the cancel button. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Whether clicking the backdrop overlay cancels the modal. Defaults to true. */
  backdropDismiss?: boolean;
  /** Deprecated alias for `backdropDismiss`. */
  shouldBackdropDismiss?: boolean;
  /** Color token overrides. */
  tokens?: ToastTokens;
  /** Extra CSS class name. */
  className?: string;
  /** Color semantic type for the main action button. */
  type?: "primary" | "secondary" | "success" | "error";
}

/**
 * Customization settings for blocking alert dialogs.
 */
export interface AlertOptions {
  /** Optional title to display above the message. */
  title?: string;
  /** Label for the confirmation button. Defaults to "OK". */
  okLabel?: string;
  /** Whether clicking the backdrop overlay closes the alert. Defaults to true. */
  backdropDismiss?: boolean;
  /** Deprecated alias for `backdropDismiss`. */
  shouldBackdropDismiss?: boolean;
  /** Color token overrides. */
  tokens?: ToastTokens;
  /** Extra CSS class name. */
  className?: string;
  /** Color semantic type for the main action button. */
  type?: "primary" | "secondary" | "success" | "error";
}

/**
 * Instance-level default labels, letting a consumer localize every built-in
 * piece of text this package renders without repeating the same override on
 * every dialog call. A per-call label (`ConfirmOptions.confirmLabel`, etc.)
 * still wins over its matching entry here, the same precedence `position`
 * and `duration` already have between `ToasterConfig` and a per-call option.
 */
export interface ToastLabels {
  /** Accessible label for a toast's dismiss button. Defaults to "Dismiss toast". */
  dismiss?: string;
  /** Default label for a confirm dialog's positive action button. Defaults to "Confirm". */
  confirm?: string;
  /** Default label for a confirm or prompt dialog's negative action button. Defaults to "Cancel". */
  cancel?: string;
  /** Default label for a prompt dialog's submit button. Defaults to "Submit". */
  submit?: string;
  /** Default label for an alert dialog's acknowledgement button. Defaults to "OK". */
  ok?: string;
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
  dismissible?: boolean;
  /** Intuitive alias for `dismissible`. */
  closeButton?: boolean;
  /** Whether semantic toasts automatically dismiss after duration. */
  autoDismiss?: boolean;
}

/**
 * Fallback defaults for loading toasts.
 */
export interface LoadingDefaults {
  /** Default screen placement for loading toasts. */
  position?: ToastPosition;
  /** Whether loading toasts show a close button by default. */
  dismissible?: boolean;
  /** Intuitive alias for `dismissible`. */
  closeButton?: boolean;
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
  dismissible?: boolean;
  /** Intuitive alias for `dismissible`. */
  closeButton?: boolean;
  /** Whether custom toasts automatically dismiss after duration. */
  autoDismiss?: boolean;
}

/**
 * Options for binding toasts to promise lifecycles via `toast.promise()`.
 */
export interface PromiseToastOptions<T> {
  /** Content to display while the promise is pending. */
  loading: string | ToastOptions;
  /** Content to display when the promise successfully resolves. */
  success: string | ToastOptions | ((data: T) => string | ToastOptions);
  /** Content to display when the promise rejects. */
  error: string | ToastOptions | ((error: unknown) => string | ToastOptions);
  /** Viewport position for the toast. */
  position?: ToastPosition;
  /** Visibility duration in milliseconds for the resolved state. */
  duration?: number;
  /** Whether to render a close button. */
  dismissible?: boolean;
  /** Intuitive alias for `dismissible`. */
  closeButton?: boolean;
  /** Scoped design tokens. */
  tokens?: ToastTokens;
  /** Extra CSS classes. */
  className?: string;
  /** Viewport margin configurations. */
  margin?: string | { x?: string; y?: string };
}

/**
 * Dispatcher interface for displaying interactive browser-native modal dialogs.
 */
export interface DialogDispatcher {
  /**
   * Displays a confirmation modal dialog with confirm and cancel buttons.
   *
   * @param message The confirmation message or question text.
   * @param options Configuration options for labels and backdrop behavior.
   * @returns An interactive handle containing the user decision promise.
   * @throws {Error} If the instance is destroyed, the message is empty, or no DOM is available.
   */
  confirm(message: string, options?: ConfirmOptions): InteractiveToastHandle<boolean>;

  /**
   * Displays a prompt input dialog requesting user text input.
   *
   * @param message Label description for the text input.
   * @param options Prefilled default value, placeholder text, and cancel behavior options.
   * @returns An interactive handle containing the input value promise.
   * @throws {Error} If the instance is destroyed, the message is empty, or no DOM is available.
   */
  prompt(message: string, options?: PromptOptions): InteractiveToastHandle<string | null>;

  /**
   * Displays a blocking informational alert modal dialog.
   *
   * @param message The alert warning or notification statement.
   * @param options Custom OK button labels and backdrop click closing options.
   * @returns An interactive handle containing the acknowledgement promise.
   * @throws {Error} If the instance is destroyed, the message is empty, or no DOM is available.
   */
  alert(message: string, options?: AlertOptions): InteractiveToastHandle<void>;
}

/**
 * Represents the Toaster instance controller.
 */
export interface Toaster {
  /**
   * Dispatches a default neutral notification.
   *
   * @param message Message text to display.
   * @param options Scoped options including duration, position, dismissible, etc.
   */
  (message: string, options?: ToastOptions): ToastHandle;
  /**
   * Dispatches a default neutral notification via options object.
   *
   * @param options Scoped options including message, title, duration, etc.
   */
  (options: ToastOptions): ToastHandle;

  /**
   * Displays a success notification.
   */
  success(message: string, options?: ToastOptions): ToastHandle;
  success(options: ToastOptions): ToastHandle;

  /**
   * Displays an error notification.
   */
  error(message: string, options?: ToastOptions): ToastHandle;
  error(options: ToastOptions): ToastHandle;

  /**
   * Displays a warning notification.
   */
  warning(message: string, options?: ToastOptions): ToastHandle;
  warning(options: ToastOptions): ToastHandle;

  /**
   * Displays an informational notification.
   */
  info(message: string, options?: ToastOptions): ToastHandle;
  info(options: ToastOptions): ToastHandle;

  /**
   * Displays a stateful progress loader toast. By default, loading toasts do not auto-dismiss.
   */
  loading(message: string, options?: LoadingToastOptions): ToastHandle;
  loading(options?: LoadingToastOptions): ToastHandle;

  /**
   * Displays custom HTML or DOM node content.
   */
  custom(content: ToastContent, options?: Omit<CustomToastOptions, "content">): ToastHandle;
  custom(options: CustomToastOptions): ToastHandle;

  /**
   * Binds a notification to a Promise lifecycle, automatically managing transition
   * states and auto-dismissal.
   *
   * @param promise The Promise or PromiseLike to track.
   * @param options State configurations for loading, success, and error.
   * @returns The original Promise result.
   */
  promise<T>(promise: PromiseLike<T>, options: PromiseToastOptions<T>): Promise<T>;

  /** Interactive native dialog dispatcher. */
  readonly dialog: DialogDispatcher;

  /**
   * Clears all active and queued non-interactive toasts.
   *
   * @throws {Error} If the toaster instance has been destroyed.
   */
  clear(): void;

  /**
   * Dismisses a specific toast handle, or all active toasts if handle is omitted.
   *
   * @param handle Optional handle of the toast to dismiss.
   */
  dismiss(handle?: ToastHandle): void;

  /**
   * Reconfigures the toaster at runtime.
   *
   * @param config Runtime configuration to validate and apply.
   */
  configure(config: ToasterRuntimeConfig): void;

  /**
   * Fully tears down this toaster instance.
   */
  destroy(): void;
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
  dismissible?: boolean;
  /** Intuitive alias for `dismissible`. */
  closeButton?: boolean;
  /** Dismiss automatically when duration expires by default. Defaults to true. */
  autoDismiss?: boolean;
  /** Instance-level default labels for the dismiss button and dialog buttons. */
  labels?: ToastLabels;
  /** Dynamic CSS variables applied to all toasts inside this instance. */
  tokens?: ToastTokens;
  /**
   * Nonce applied to the `<style>` element `tokens` are written through, for
   * a host `style-src` Content Security Policy that requires one. Has no
   * effect without `tokens`.
   */
  nonce?: string;
  /** Scoped fallback overrides per notification type. */
  semantic?: SemanticDefaults;
  loading?: LoadingDefaults;
  custom?: CustomDefaults;
  /**
   * Margin from the border of the viewport. Can be a CSS length (e.g.
   * "24px", "1.5rem") or an object.
   */
  margin?: string | { x?: string; y?: string };
  /**
   * Extra CSS class name applied to every toast and dialog dispatched from
   * this instance.
   */
  className?: string;
}

/** Runtime configuration fields that can change after construction. */
export type ToasterRuntimeConfig = Omit<Partial<ToasterConfig>, "container">;
