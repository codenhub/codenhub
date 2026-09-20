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
  destructiveBg?: string;
  /** Foreground (text/icon) color for the toast-error variant. */
  destructiveFg?: string;
  /** Border color for the toast-error variant. */
  destructiveEdge?: string;
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
  /** Background color for the destructive dialog action button. */
  destructiveBtnBg?: string;
  /** Foreground color for the destructive dialog action button. */
  destructiveBtnFg?: string;
  /** Hover background color for the destructive dialog action button. */
  destructiveBtnBgHover?: string;
  /** Border color for the destructive dialog action button when `.edged` is active. */
  destructiveBtnEdge?: string;
}

/**
 * Options that can be dynamically updated on a live toast instance.
 */
export interface ToastUpdateOptions {
  /**
   * The new message text. Ignored if `content` is also given in this same
   * call; has no effect on a toast that was built from `content` rather
   * than `message` (there is no message slot to write into).
   */
  message?: string;
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
  type?: SemanticType;
  /** New visibility duration in milliseconds, applied the next time an auto-dismiss timer would run. */
  duration?: number;
  /** Enables or disables automatic dismissal after `duration`. */
  shouldAutoDismiss?: boolean;
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
 */
export interface InteractiveToastHandle<T> {
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
 * Union type representing the acceptable content values inside custom toasts.
 */
type ToastContentValue = string | Node;

/**
 * Supported custom content. Strings are sanitized by the package. DOM nodes
 * are trusted application-owned content and are inserted without sanitizing.
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
  /**
   * Margin from the border of the viewport. Can be a CSS length (e.g.
   * "24px", "1.5rem") or an object. This is a property of the shared stack
   * at this position, not of an individual toast: the most recent explicit
   * value dispatched to a given position applies to every toast already
   * showing there, and a dispatch that omits it leaves the stack's current
   * margin unchanged. Toasts at the same position always share one margin.
   */
  margin?: string | { x?: string; y?: string };
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
  /**
   * Margin from the border of the viewport. Can be a CSS length (e.g.
   * "24px", "1.5rem") or an object. This is a property of the shared stack
   * at this position, not of an individual toast: the most recent explicit
   * value dispatched to a given position applies to every toast already
   * showing there, and a dispatch that omits it leaves the stack's current
   * margin unchanged. Toasts at the same position always share one margin.
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
  isDismissable?: boolean;
  /** Whether to automatically close after duration. Defaults to toaster configuration. */
  shouldAutoDismiss?: boolean;
  /** Color token overrides. */
  tokens?: ToastTokens;
  /** Extra CSS class name. */
  className?: string;
  /** Accessibility role. Defaults to "status". */
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
  /** Optional title to display above the message. */
  title?: string;
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
   * "24px", "1.5rem") or an object. This is a property of the shared stack
   * at this position, not of an individual toast: the most recent explicit
   * value dispatched to a given position applies to every toast already
   * showing there, and a dispatch that omits it leaves the stack's current
   * margin unchanged. Toasts at the same position always share one margin.
   */
  margin?: string | { x?: string; y?: string };
  /**
   * Extra CSS class name applied to every toast and dialog dispatched from
   * this instance. Unlike `duration` and `position` above, this does not get
   * overridden by a per-call `className` — the two are appended together
   * (instance default first, then the call's own class).
   */
  className?: string;
}

/** Runtime configuration fields that can change after construction. */
export type ToasterRuntimeConfig = Omit<Partial<ToasterConfig>, "container">;
