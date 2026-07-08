import { removeAllContainers } from "./dom";
import { ModalManager } from "./modal";
import { DEFAULT_CONFIG, type ResolvedToastConfig } from "./options";
import { Toast } from "./toast-base";
import { applyGlobalTokens, removeGlobalTokens } from "./tokens";
import type {
  AlertOptions,
  ConfirmOptions,
  CustomToastOptions,
  InteractiveToastHandle,
  LoadingToastOptions,
  PromptOptions,
  SemanticToastOptions,
  SemanticType,
  ToastHandle,
  ToasterConfig,
  ToastUpdateOptions,
} from "./types";
import { LoadingToast } from "./variants/loading";
import { SemanticToast } from "./variants/semantic";

// ---------------------------------------------------------------------------
// Unique ID generator for style element scoping
// ---------------------------------------------------------------------------

let instanceCounter = 0;
function nextInstanceId(): string {
  return `toast-instance-${++instanceCounter}`;
}

// ---------------------------------------------------------------------------
// ToastHandle factory — wraps internal Toast; the only public API consumers get
// ---------------------------------------------------------------------------

function makeHandle(toast: Toast): ToastHandle {
  return {
    dismiss: () => toast.hide(),
    update: (opts: ToastUpdateOptions) => toast.update(opts),
    get settled(): Promise<void> {
      return toast.settled;
    },
    get state() {
      return toast.publicState;
    },
  };
}

// ---------------------------------------------------------------------------
// Category managers
// ---------------------------------------------------------------------------

/**
 * Manager for dispatching and clearing pre-styled semantic toasts (success, error, warning, info).
 */
export interface SemanticManager {
  /**
   * Displays a semantic toast notification.
   *
   * @param options Config options including message and semantic type.
   */
  show(options: SemanticToastOptions & { type?: SemanticType }): ToastHandle;

  /**
   * Displays a success notification.
   *
   * @param message Description text.
   * @param options Extensible options.
   */
  success(message: string, options?: Omit<SemanticToastOptions, "message">): ToastHandle;

  /**
   * Displays an error notification.
   *
   * @param message Description text.
   * @param options Extensible options.
   */
  error(message: string, options?: Omit<SemanticToastOptions, "message">): ToastHandle;

  /**
   * Displays a warning notification.
   *
   * @param message Description text.
   * @param options Extensible options.
   */
  warning(message: string, options?: Omit<SemanticToastOptions, "message">): ToastHandle;

  /**
   * Displays an informational notification.
   *
   * @param message Description text.
   * @param options Extensible options.
   */
  info(message: string, options?: Omit<SemanticToastOptions, "message">): ToastHandle;

  /**
   * Dismisses all active semantic toasts.
   */
  clear(): void;
}

/**
 * Manager for showing and clearing persistent loading toasts.
 */
export interface LoadingManager {
  /**
   * Displays a loading progress indicator toast.
   *
   * @param options Toast settings.
   */
  show(options: LoadingToastOptions): ToastHandle;

  /**
   * Dismisses all active loading toasts.
   */
  clear(): void;
}

/**
 * Manager for displaying interactive modal confirm, prompt, and alert dialogs.
 */
export interface InteractiveManager {
  /**
   * Dispatches a confirmation modal dialog.
   *
   * @param message Question or description statement.
   * @param options Buttons labels and cancel behavior settings.
   */
  confirm(message: string, options?: ConfirmOptions): InteractiveToastHandle<boolean>;

  /**
   * Dispatches a text input prompt modal dialog.
   *
   * @param message Label description for the input text field.
   * @param options Default values, placeholders, and buttons settings.
   */
  prompt(message: string, options?: PromptOptions): InteractiveToastHandle<string | null>;

  /**
   * Dispatches a blocking warning alert modal dialog.
   *
   * @param message Statement message.
   * @param options OK button configuration.
   */
  alert(message: string, options?: AlertOptions): InteractiveToastHandle<void>;
}

/**
 * Manager for custom layout toasts.
 */
export interface CustomManager {
  /**
   * Displays a custom HTML or DOM node toast.
   *
   * @param options Layout content options.
   */
  show(options: CustomToastOptions): ToastHandle;

  /**
   * Dismisses all active custom toasts.
   */
  clear(): void;
}

// ---------------------------------------------------------------------------
// Toaster — public interface
// ---------------------------------------------------------------------------

/**
 * Represents the main Toaster instance controller.
 */
export interface Toaster {
  /** Semantic toast dispatcher sub-manager. */
  readonly semantic: SemanticManager;
  /** Loading indicator dispatcher sub-manager. */
  readonly loading: LoadingManager;
  /** Interactive native dialog dispatcher sub-manager. */
  readonly interactive: InteractiveManager;
  /** Custom DOM layout dispatcher sub-manager. */
  readonly custom: CustomManager;

  /**
   * Displays a success notification.
   *
   * @param message Description text.
   * @param options Extensible options.
   */
  success(message: string, options?: Omit<SemanticToastOptions, "message">): ToastHandle;

  /**
   * Displays an error notification.
   *
   * @param message Description text.
   * @param options Extensible options.
   */
  error(message: string, options?: Omit<SemanticToastOptions, "message">): ToastHandle;

  /**
   * Displays a warning notification.
   *
   * @param message Description text.
   * @param options Extensible options.
   */
  warning(message: string, options?: Omit<SemanticToastOptions, "message">): ToastHandle;

  /**
   * Displays an informational notification.
   *
   * @param message Description text.
   * @param options Extensible options.
   */
  info(message: string, options?: Omit<SemanticToastOptions, "message">): ToastHandle;

  /**
   * Dispatches a confirmation modal dialog.
   *
   * @param message Question or description statement.
   * @param options Buttons labels and cancel behavior settings.
   */
  confirm(message: string, options?: ConfirmOptions): InteractiveToastHandle<boolean>;

  /**
   * Dispatches a text input prompt modal dialog.
   *
   * @param message Label description for the input text field.
   * @param options Default values, placeholders, and buttons settings.
   */
  prompt(message: string, options?: PromptOptions): InteractiveToastHandle<string | null>;

  /**
   * Dispatches a blocking warning alert modal dialog.
   *
   * @param message Statement message.
   * @param options OK button configuration.
   */
  alert(message: string, options?: AlertOptions): InteractiveToastHandle<void>;

  /** Clear all non-interactive toasts. */
  clear(): void;

  /** Reconfigure the toaster at runtime. */
  configure(config: Partial<ToasterConfig>): void;

  /**
   * Fully tear down this toaster instance: dismisses all toasts, closes any
   * open modal, removes all created DOM nodes and the injected style element.
   * All subsequent calls on this instance will throw.
   */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// ToastManager implementation
// ---------------------------------------------------------------------------

class ToastManager implements Toaster {
  private config: ToasterConfig;
  private resolved: ResolvedToastConfig;
  private readonly instanceId: string;
  private isDestroyed = false;

  // Tracks active toasts per category for scoped clear()
  private readonly semanticToasts = new Set<Toast>();
  private readonly loadingToasts = new Set<Toast>();
  private readonly customToasts = new Set<Toast>();

  private readonly modalManager: ModalManager;

  public readonly semantic: SemanticManager;
  public readonly loading: LoadingManager;
  public readonly interactive: InteractiveManager;
  public readonly custom: CustomManager;

  constructor(config: ToasterConfig = {}) {
    this.instanceId = nextInstanceId();
    this.config = config;
    this.resolved = this.buildResolvedConfig(config);

    if (config.tokens) {
      applyGlobalTokens(config.tokens, this.instanceId);
    }

    const parent = this.getParent();
    this.modalManager = new ModalManager(parent, this.instanceId);

    this.semantic = this.buildSemanticManager();
    this.loading = this.buildLoadingManager();
    this.interactive = this.buildInteractiveManager();
    this.custom = this.buildCustomManager();
  }

  // --- Public flat aliases --------------------------------------------------

  public success(message: string, options?: Omit<SemanticToastOptions, "message">): ToastHandle {
    return this.semantic.success(message, options);
  }

  public error(message: string, options?: Omit<SemanticToastOptions, "message">): ToastHandle {
    return this.semantic.error(message, options);
  }

  public warning(message: string, options?: Omit<SemanticToastOptions, "message">): ToastHandle {
    return this.semantic.warning(message, options);
  }

  public info(message: string, options?: Omit<SemanticToastOptions, "message">): ToastHandle {
    return this.semantic.info(message, options);
  }

  public confirm(message: string, options?: ConfirmOptions): InteractiveToastHandle<boolean> {
    return this.interactive.confirm(message, options);
  }

  public prompt(message: string, options?: PromptOptions): InteractiveToastHandle<string | null> {
    return this.interactive.prompt(message, options);
  }

  public alert(message: string, options?: AlertOptions): InteractiveToastHandle<void> {
    return this.interactive.alert(message, options);
  }

  // --- Toaster-level operations --------------------------------------------

  public clear(): void {
    this.assertAlive();
    this.semantic.clear();
    this.loading.clear();
    this.custom.clear();
  }

  public configure(config: Partial<ToasterConfig>): void {
    this.assertAlive();
    this.config = { ...this.config, ...config };
    this.resolved = this.buildResolvedConfig(this.config);

    if (config.tokens !== undefined) {
      applyGlobalTokens(this.config.tokens, this.instanceId);
    }
  }

  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;

    // Immediately hide all active toasts (no animation)
    this.semanticToasts.forEach((t) => t.hide());
    this.loadingToasts.forEach((t) => t.hide());
    this.customToasts.forEach((t) => t.hide());
    this.semanticToasts.clear();
    this.loadingToasts.clear();
    this.customToasts.clear();

    this.modalManager.destroy();

    const parent = this.getParent();
    removeAllContainers(parent);
    removeGlobalTokens(this.instanceId);
  }

  // --- Category manager builders -------------------------------------------

  private buildSemanticManager(): SemanticManager {
    const showSemantic = (
      type: SemanticType,
      message: string,
      options?: Omit<SemanticToastOptions, "message">,
    ): ToastHandle => {
      this.assertAlive();
      const merged = { ...this.config.semantic, ...options, message, type };
      const toast = new SemanticToast(merged, this.resolved, this.getParent());
      return this.registerToast(toast, this.semanticToasts);
    };

    return {
      show: (options) => {
        this.assertAlive();
        const merged = { ...this.config.semantic, ...options };
        const toast = new SemanticToast(merged, this.resolved, this.getParent());
        return this.registerToast(toast, this.semanticToasts);
      },
      success: (msg, opts) => showSemantic("success", msg, opts),
      error: (msg, opts) => showSemantic("error", msg, opts),
      warning: (msg, opts) => showSemantic("warning", msg, opts),
      info: (msg, opts) => showSemantic("info", msg, opts),
      clear: () => {
        this.assertAlive();
        this.semanticToasts.forEach((t) => t.hide());
        this.semanticToasts.clear();
      },
    };
  }

  private buildLoadingManager(): LoadingManager {
    return {
      show: (options) => this.showLoadingToast(options),
      clear: () => {
        this.assertAlive();
        this.loadingToasts.forEach((t) => t.hide());
        this.loadingToasts.clear();
      },
    };
  }

  private showLoadingToast(options: LoadingToastOptions): ToastHandle {
    this.assertAlive();
    const merged = { ...this.config.loading, ...options };
    const toast = new LoadingToast(merged, this.resolved, this.getParent());
    return this.registerToast(toast, this.loadingToasts);
  }

  private buildInteractiveManager(): InteractiveManager {
    return {
      confirm: (msg, opts) => {
        this.assertAlive();
        return this.modalManager.confirm(msg, opts);
      },
      prompt: (msg, opts) => {
        this.assertAlive();
        return this.modalManager.prompt(msg, opts);
      },
      alert: (msg, opts) => {
        this.assertAlive();
        return this.modalManager.alert(msg, opts);
      },
    };
  }

  private buildCustomManager(): CustomManager {
    return {
      show: (options) => {
        this.assertAlive();
        const merged = { ...this.config.custom, ...options };
        const toast = new Toast(merged, this.resolved, this.getParent());
        return this.registerToast(toast, this.customToasts);
      },
      clear: () => {
        this.assertAlive();
        this.customToasts.forEach((t) => t.hide());
        this.customToasts.clear();
      },
    };
  }

  // --- Internals ------------------------------------------------------------

  private registerToast(toast: Toast, bucket: Set<Toast>): ToastHandle {
    bucket.add(toast);
    toast.onHidden(() => bucket.delete(toast));
    toast.show();
    return makeHandle(toast);
  }

  private getParent(): HTMLElement {
    return this.config.container ?? document.body ?? document.documentElement;
  }

  private buildResolvedConfig(config: ToasterConfig): ResolvedToastConfig {
    return {
      instanceId: this.instanceId,
      position: config.position ?? DEFAULT_CONFIG.position,
      duration: config.duration ?? DEFAULT_CONFIG.duration,
      isDismissable: config.isDismissable ?? DEFAULT_CONFIG.isDismissable,
      shouldAutoDismiss: config.shouldAutoDismiss ?? DEFAULT_CONFIG.shouldAutoDismiss,
      maxVisible: config.maxVisible ?? DEFAULT_CONFIG.maxVisible,
    };
  }

  private assertAlive(): void {
    if (this.isDestroyed) {
      throw new Error("This toaster instance has been destroyed. Create a new one with createToaster().");
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a new independent toaster instance.
 *
 * Each call returns a fresh instance.
 * Consumers who want a singleton are responsible for maintaining it:
 *
 * @example
 * // toaster.ts (your singleton module)
 * export const toaster = createToaster({ position: "top-right" });
 *
 * @param config Optional initial configuration overrides for the toaster.
 * @returns An independent Toaster instance controller.
 */
export function createToaster(config?: ToasterConfig): Toaster {
  return new ToastManager(config);
}
