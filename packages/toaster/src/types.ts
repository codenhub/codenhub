/**
 * Toast notification positions on the viewport.
 */
export type ToastPosition = "top-left" | "top-right" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";

/**
 * How urgently screen readers announce a toast: `"status"` through the
 * instance's polite live region, `"alert"` through its assertive one.
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
   * construction: a string renders as plain text, a DOM node is trusted
   * and used as-is. Supersedes `message` and `icon` in this same call, the same
   * mutual exclusivity construction itself applies.
   */
  content?: ToastContent;
  /**
   * Swaps the icon glyph, or `null` to remove it. Ignored in a call that
   * also gives `content`, and on a toast showing custom content. If `type`
   * is given in the same call and `icon` is not, the icon matching that
   * type is used automatically.
   */
  icon?: ToastIcon | null;
  /**
   * Switches the toast's severity color and announcement role to match --
   * the same success/error/warning/info categories a semantic toast is
   * dispatched with -- so e.g. a loading toast can complete into a success
   * toast: `update({ type: "success" })`.
   */
  type?: SemanticType | "default";
  /** New visibility duration in milliseconds. On a showing toast, the timer restarts with it right away. */
  duration?: number;
  /** Enables or disables automatic dismissal after `duration`. */
  autoDismiss?: boolean;
  /** Enables or disables the dismiss button. */
  dismissible?: boolean;
  /**
   * Replaces the classes the toast was called with. The toast's own classes
   * and the instance's `className` stay.
   */
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
   * Patches the message, content, icon, severity, timing, or classes
   * of a toast. Applied immediately when the toast is visible; if
   * it is still queued, the update is stored and applied once a slot
   * opens rather than discarded. Has no effect once the toast has settled.
   *
   * @param options Partial updates to apply.
   * @throws {Error} If `options.duration` is not a number from 0 to 2147483647,
   *   `options.type` is not a recognized severity, or `options.content`
   *   resolves to nothing renderable.
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
   * Registers a callback to trigger when the toast is added to the page,
   * which for a queued toast is when a slot opens for it.
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
export interface DialogHandle<T> extends PromiseLike<T> {
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
   *
   * Rejects with the browser's error if the dialog cannot open, which is
   * when `showModal()` throws.
   */
  readonly result: Promise<T>;
}

/**
 * Supported custom content. A string renders as plain text, never parsed as
 * HTML, so markup in it shows literally. For markup, pass a DOM node: nodes
 * are trusted application-owned content and are inserted as they are.
 * Can also be a function that returns content; it receives the toast's `ToastHandle`.
 */
export type ToastContent = string | Node | ((handle: ToastHandle) => string | Node);

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
  /** Whether to automatically close after the duration. Defaults to toaster configuration. */
  autoDismiss?: boolean;
  /** Extra CSS class name. */
  className?: string;
  /** Announcement role, see {@link ToastRole}. Defaults to the variant's role. */
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
  /** Whether the user can manually close it. Defaults to `ToasterConfig.loading.dismissible`, then the instance's `dismissible` (`false`). */
  dismissible?: boolean;
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
  /** The custom text, DOM Node, or creator function. */
  content: ToastContent;
  /** Placement on the screen. Defaults to toaster configuration. */
  position?: ToastPosition;
  /** Visibility duration in milliseconds. Defaults to toaster configuration. */
  duration?: number;
  /** Whether to render a close button. Defaults to toaster configuration. */
  dismissible?: boolean;
  /** Whether to automatically close after duration. Defaults to toaster configuration. */
  autoDismiss?: boolean;
  /** Extra CSS class name. */
  className?: string;
  /** Announcement role, see {@link ToastRole}. Defaults to "status". */
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
  /** Extra CSS class name. */
  className?: string;
  /** Color semantic type for the main action button. */
  type?: "primary" | "secondary" | "success" | "error";
}

/**
 * Instance-level text for the toasts' built-in controls, for localization.
 */
export interface ToastLabels {
  /** Accessible label for a toast's dismiss button. Defaults to "Dismiss toast". */
  dismiss?: string;
  /** Accessible name of the region landmark each toast stack is. Defaults to "Notifications". */
  notifications?: string;
}

/**
 * Instance-level default button labels for dialogs, for localization without
 * repeating them on every call. A per-call label (`ConfirmOptions.confirmLabel`,
 * etc.) still wins over its matching entry here.
 */
export interface DialogLabels {
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
  /** Whether custom toasts automatically dismiss after duration. */
  autoDismiss?: boolean;
}

/**
 * Options for binding toasts to promise lifecycles via `toast.promise()`.
 */
export interface PromiseToastOptions<T> {
  /** Content to display while the promise is pending: a message, or the options a `loading()` toast takes. */
  loading: string | LoadingToastOptions;
  /**
   * Content to display when the promise successfully resolves. The result
   * is the loading toast updated in place, so it keeps its stack, and its
   * type and role come from the outcome: `position`, `margin`, `role`, and
   * `type` are left out.
   */
  success:
    | string
    | Omit<ToastOptions, "position" | "margin" | "role" | "type">
    | ((data: T) => string | Omit<ToastOptions, "position" | "margin" | "role" | "type">);
  /** Content to display when the promise rejects. Takes the same options as `success`. */
  error:
    | string
    | Omit<ToastOptions, "position" | "margin" | "role" | "type">
    | ((error: unknown) => string | Omit<ToastOptions, "position" | "margin" | "role" | "type">);
  /** Viewport position for the toast, while pending and after. */
  position?: ToastPosition;
  /** Visibility duration in milliseconds for the resolved state. Defaults to `ToasterConfig.semantic.duration`, then the instance's `duration`. */
  duration?: number;
  /** Whether to render a close button, while pending and after. The resolved state defaults to `ToasterConfig.semantic.dismissible`, then the instance's `dismissible`, when this is unset. */
  dismissible?: boolean;
  /** Extra CSS classes. */
  className?: string;
  /** Viewport margin configurations. */
  margin?: string | { x?: string; y?: string };
}

/**
 * A dialogs instance, made with `createDialogs` or the ready-made `dialog`
 * from `@codenhub/toaster/dialog`. Its dialogs open one at a time, in order.
 */
export interface Dialogs {
  /**
   * Displays a confirmation modal dialog with confirm and cancel buttons.
   *
   * @param message The confirmation message or question text.
   * @param options Configuration options for labels and backdrop behavior.
   * @returns An interactive handle containing the user decision promise.
   * @throws {Error} If the instance is destroyed, the message is empty, or no DOM is available.
   */
  confirm(message: string, options?: ConfirmOptions): DialogHandle<boolean>;

  /**
   * Displays a prompt input dialog requesting user text input.
   *
   * @param message Label description for the text input.
   * @param options Prefilled default value, placeholder text, and cancel behavior options.
   * @returns An interactive handle containing the input value promise.
   * @throws {Error} If the instance is destroyed, the message is empty, or no DOM is available.
   */
  prompt(message: string, options?: PromptOptions): DialogHandle<string | null>;

  /**
   * Displays a blocking informational alert modal dialog.
   *
   * @param message The alert warning or notification statement.
   * @param options Custom OK button labels and backdrop click closing options.
   * @returns An interactive handle containing the acknowledgement promise.
   * @throws {Error} If the instance is destroyed, the message is empty, or no DOM is available.
   */
  alert(message: string, options?: AlertOptions): DialogHandle<void>;

  /**
   * Reconfigures the instance. Applies to dialogs that open afterwards.
   *
   * @param config Runtime configuration to validate and apply.
   * @throws {Error} If the instance is destroyed or `container` is given.
   */
  configure(config: DialogsRuntimeConfig): void;

  /**
   * Closes every open and queued dialog, settling each with its cancel value,
   * and removes the instance's dialog element. Calling it again does nothing.
   */
  destroy(): void;
}

/**
 * Configuration for a dialogs instance.
 */
export interface DialogsConfig {
  /** Parent DOM element receiving the dialog element. Defaults to document.body. */
  container?: HTMLElement;
  /** Instance-level default button labels. */
  labels?: DialogLabels;
  /** Extra CSS class name applied to every dialog from this instance. */
  className?: string;
}

/** Dialogs configuration fields that can change after construction. */
export type DialogsRuntimeConfig = Omit<Partial<DialogsConfig>, "container">;

/**
 * Represents the Toaster instance controller.
 */
export interface Toaster {
  /**
   * Dispatches a default neutral notification.
   *
   * @param message Message text to display.
   * @param options Scoped options including duration, position, dismissible, etc.
   * @returns A handle to update, dismiss, or watch the toast.
   * @throws {Error} If the instance is destroyed, no DOM is available, the
   *   toast has neither a message nor a title, or `duration`, `type`,
   *   `position`, or `role` is invalid.
   */
  (message: string, options?: ToastOptions): ToastHandle;
  /**
   * Dispatches a default neutral notification via options object.
   *
   * @param options Scoped options including message, title, duration, etc.
   * @returns A handle to update, dismiss, or watch the toast.
   * @throws {Error} For the same reasons as the call with a message.
   */
  (options: ToastOptions): ToastHandle;

  /**
   * Displays a success notification.
   *
   * @returns A handle to update, dismiss, or watch the toast.
   * @throws {Error} For the same reasons as calling the toaster itself.
   */
  success(message: string, options?: ToastOptions): ToastHandle;
  success(options: ToastOptions): ToastHandle;

  /**
   * Displays an error notification.
   *
   * @returns A handle to update, dismiss, or watch the toast.
   * @throws {Error} For the same reasons as calling the toaster itself.
   */
  error(message: string, options?: ToastOptions): ToastHandle;
  error(options: ToastOptions): ToastHandle;

  /**
   * Displays a warning notification.
   *
   * @returns A handle to update, dismiss, or watch the toast.
   * @throws {Error} For the same reasons as calling the toaster itself.
   */
  warning(message: string, options?: ToastOptions): ToastHandle;
  warning(options: ToastOptions): ToastHandle;

  /**
   * Displays an informational notification.
   *
   * @returns A handle to update, dismiss, or watch the toast.
   * @throws {Error} For the same reasons as calling the toaster itself.
   */
  info(message: string, options?: ToastOptions): ToastHandle;
  info(options: ToastOptions): ToastHandle;

  /**
   * Displays a stateful progress loader toast. By default, loading toasts do not auto-dismiss.
   *
   * @returns A handle to update the toast into its result, or dismiss it.
   * @throws {Error} If the instance is destroyed, no DOM is available, the
   *   toast has neither a message nor a title, or `position` is invalid.
   */
  loading(message: string, options?: LoadingToastOptions): ToastHandle;
  loading(options?: LoadingToastOptions): ToastHandle;

  /**
   * Displays custom content: a string as plain text, or a DOM node as is.
   *
   * @returns A handle to update, dismiss, or watch the toast.
   * @throws {Error} If the instance is destroyed, no DOM is available, the
   *   content is empty or not an element, text, or fragment, or `duration`,
   *   `position`, or `role` is invalid.
   */
  custom(content: ToastContent, options?: Omit<CustomToastOptions, "content">): ToastHandle;
  custom(options: CustomToastOptions): ToastHandle;

  /**
   * Binds a notification to a Promise lifecycle, automatically managing transition
   * states and auto-dismissal.
   *
   * @param promise The Promise or PromiseLike to track.
   * @param options State configurations for loading, success, and error.
   * @returns A promise that settles the same way as `promise`.
   * @throws {Error} Synchronously, if the loading toast cannot be shown, for
   *   the same reasons as `loading()`.
   */
  promise<T>(promise: PromiseLike<T>, options: PromiseToastOptions<T>): Promise<T>;

  /**
   * Dismisses every showing and queued toast of this instance.
   *
   * @throws {Error} If the instance is destroyed.
   */
  clear(): void;

  /**
   * Dismisses one toast, or every toast of this instance, the same as
   * `clear()`, when `handle` is omitted.
   *
   * @param handle Optional handle of the toast to dismiss.
   * @throws {Error} If the instance is destroyed.
   */
  dismiss(handle?: ToastHandle): void;

  /**
   * Reconfigures the toaster at runtime. An option given as `undefined`
   * resets to its default, on the toasts already showing too.
   *
   * @param config Runtime configuration to validate and apply.
   * @throws {Error} If the instance is destroyed, `container` is given, or a
   *   position, a duration, or `maxVisible` is invalid.
   */
  configure(config: ToasterRuntimeConfig): void;

  /**
   * Fully tears down this toaster instance. Calling it again does nothing.
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
  /** Dismiss automatically when duration expires by default. Defaults to true. */
  autoDismiss?: boolean;
  /** Instance-level text for the dismiss button and the stack's region name. */
  labels?: ToastLabels;
  /** Defaults for `success`, `error`, `warning`, and `info` toasts and the outcome of `promise`, over the instance-wide ones. */
  semantic?: SemanticDefaults;
  /** Defaults for `loading` toasts and the loading phase of `promise`, over the instance-wide ones. */
  loading?: LoadingDefaults;
  /** Defaults for `custom` toasts, over the instance-wide ones. */
  custom?: CustomDefaults;
  /**
   * Margin from the border of the viewport. Can be a CSS length (e.g.
   * "24px", "1.5rem") or an object.
   */
  margin?: string | { x?: string; y?: string };
  /** Extra CSS class name applied to every toast dispatched from this instance. */
  className?: string;
}

/** Runtime configuration fields that can change after construction. */
export type ToasterRuntimeConfig = Omit<Partial<ToasterConfig>, "container">;
