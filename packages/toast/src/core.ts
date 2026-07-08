import { removeAllContainers } from "./dom";
import { createCustomManager, type CustomManager } from "./managers/custom";
import { createInteractiveManager, type InteractiveManager } from "./managers/interactive";
import { createLoadingManager, type LoadingManager } from "./managers/loading";
import { createSemanticManager, type SemanticManager } from "./managers/semantic";
import { ModalManager } from "./modal";
import { DEFAULT_CONFIG } from "./options";
import type { ResolvedToastConfig } from "./options";
import type { Toast } from "./toast-base";
import { applyGlobalTokens, removeGlobalTokens } from "./tokens";
import type {
  AlertOptions,
  ConfirmOptions,
  InteractiveToastHandle,
  PromptOptions,
  SemanticToastOptions,
  ToasterConfig,
  ToastHandle,
  ToastUpdateOptions,
} from "./types";

export type { SemanticManager } from "./managers/semantic";
export type { LoadingManager } from "./managers/loading";
export type { CustomManager } from "./managers/custom";
export type { InteractiveManager } from "./managers/interactive";

let instanceCounter = 0;
function generateInstanceId(): string {
  return `toast-instance-${++instanceCounter}`;
}

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
   * @throws {Error} If the toaster instance has been destroyed.
   */
  success(message: string, options?: Omit<SemanticToastOptions, "message">): ToastHandle;

  /**
   * Displays an error notification.
   *
   * @param message Description text.
   * @param options Extensible options.
   * @throws {Error} If the toaster instance has been destroyed.
   */
  error(message: string, options?: Omit<SemanticToastOptions, "message">): ToastHandle;

  /**
   * Displays a warning notification.
   *
   * @param message Description text.
   * @param options Extensible options.
   * @throws {Error} If the toaster instance has been destroyed.
   */
  warning(message: string, options?: Omit<SemanticToastOptions, "message">): ToastHandle;

  /**
   * Displays an informational notification.
   *
   * @param message Description text.
   * @param options Extensible options.
   * @throws {Error} If the toaster instance has been destroyed.
   */
  info(message: string, options?: Omit<SemanticToastOptions, "message">): ToastHandle;

  /**
   * Dispatches a confirmation modal dialog.
   *
   * @param message Question or description statement.
   * @param options Buttons labels and cancel behavior settings.
   * @throws {Error} If the toaster instance has been destroyed.
   */
  confirm(message: string, options?: ConfirmOptions): InteractiveToastHandle<boolean>;

  /**
   * Dispatches a text input prompt modal dialog.
   *
   * @param message Label description for the input text field.
   * @param options Default values, placeholders, and buttons settings.
   * @throws {Error} If the toaster instance has been destroyed.
   */
  prompt(message: string, options?: PromptOptions): InteractiveToastHandle<string | null>;

  /**
   * Dispatches a blocking warning alert modal dialog.
   *
   * @param message Statement message.
   * @param options OK button configuration.
   * @throws {Error} If the toaster instance has been destroyed.
   */
  alert(message: string, options?: AlertOptions): InteractiveToastHandle<void>;

  /**
   * Clear all active, non-interactive toasts.
   *
   * @throws {Error} If the toaster instance has been destroyed.
   */
  clear(): void;

  /**
   * Reconfigure the toaster at runtime.
   *
   * @param config Partial configurations to update.
   * @throws {Error} If the toaster instance has been destroyed.
   */
  configure(config: Partial<ToasterConfig>): void;

  /**
   * Fully tear down this toaster instance: dismisses all toasts, closes any
   * open modal, removes all created DOM nodes and the injected style element.
   * All subsequent calls on this instance will throw.
   */
  destroy(): void;
}

class ToastManager implements Toaster {
  private config: ToasterConfig;
  private resolved: ResolvedToastConfig;
  private readonly instanceId: string;
  private isDestroyed = false;

  private readonly semanticToasts = new Set<Toast>();
  private readonly loadingToasts = new Set<Toast>();
  private readonly customToasts = new Set<Toast>();

  private readonly modalManager: ModalManager;

  public readonly semantic: SemanticManager;
  public readonly loading: LoadingManager;
  public readonly interactive: InteractiveManager;
  public readonly custom: CustomManager;

  constructor(config: ToasterConfig = {}) {
    this.instanceId = generateInstanceId();
    this.config = config;
    this.resolved = this.buildResolvedConfig(config);

    if (config.tokens) {
      applyGlobalTokens(config.tokens, this.instanceId);
    }

    const parent = this.getParent();
    this.modalManager = new ModalManager(parent, this.instanceId);

    const context = {
      assertAlive: () => this.assertAlive(),
      getParent: () => this.getParent(),
      registerToast: (toast: Toast, bucket: Set<Toast>) => this.registerToast(toast, bucket),
      config: this.config,
      resolved: this.resolved,
    };

    this.semantic = createSemanticManager({
      ...context,
      semanticToasts: this.semanticToasts,
    });
    this.loading = createLoadingManager({
      ...context,
      loadingToasts: this.loadingToasts,
    });
    this.custom = createCustomManager({
      ...context,
      customToasts: this.customToasts,
    });
    this.interactive = createInteractiveManager({
      assertAlive: () => this.assertAlive(),
      modalManager: this.modalManager,
    });
  }

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

/**
 * Creates a new independent toaster instance.
 *
 * Each call returns a fresh instance.
 * Consumers who want a singleton are responsible for maintaining it.
 *
 * @param config Optional initial configuration overrides for the toaster.
 * @returns An independent Toaster instance controller.
 */
export function createToaster(config?: ToasterConfig): Toaster {
  return new ToastManager(config);
}
