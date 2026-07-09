import { removeInstanceContainers } from "./dom";
import { createCustomManager, type CustomManager } from "./managers/custom";
import { createInteractiveManager, type InteractiveManager } from "./managers/interactive";
import { createLoadingManager, type LoadingManager } from "./managers/loading";
import { createSemanticManager, type SemanticManager } from "./managers/semantic";
import { ModalManager } from "./modal";
import { DEFAULT_CONFIG } from "./options";
import type { ResolvedToastConfig } from "./options";
import type { Toast } from "./toast-base";
import { applyGlobalTokens, removeGlobalTokens } from "./tokens";
import type { ToasterConfig, ToastHandle, ToastUpdateOptions } from "./types";

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

  private modalManager: ModalManager | null = null;

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
      getModalManager: () => this.getModalManager(),
    });
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

    if (config.margin !== undefined) {
      const parent = this.getParent();
      parent.querySelectorAll(`[data-toast-container][data-toast-instance="${this.instanceId}"]`).forEach((el) => {
        if (el instanceof HTMLDivElement) {
          const margin = config.margin;
          if (margin) {
            if (typeof margin === "string") {
              el.style.setProperty("--toast-margin-x", margin);
              el.style.setProperty("--toast-margin-y", margin);
            } else {
              if (margin.x) {
                el.style.setProperty("--toast-margin-x", margin.x);
              } else {
                el.style.removeProperty("--toast-margin-x");
              }
              if (margin.y) {
                el.style.setProperty("--toast-margin-y", margin.y);
              } else {
                el.style.removeProperty("--toast-margin-y");
              }
            }
          } else {
            el.style.removeProperty("--toast-margin-x");
            el.style.removeProperty("--toast-margin-y");
          }
        }
      });
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

    if (this.modalManager) {
      this.modalManager.destroy();
      this.modalManager = null;
    }

    const parent = this.getParent();
    removeInstanceContainers({ parent, instanceId: this.instanceId });
    removeGlobalTokens(this.instanceId);
  }

  private registerToast(toast: Toast, bucket: Set<Toast>): ToastHandle {
    bucket.add(toast);
    toast.onHidden(() => bucket.delete(toast));
    toast.show();
    return makeHandle(toast);
  }

  private getModalManager(): ModalManager {
    if (!this.modalManager) {
      this.modalManager = new ModalManager(this.getParent(), this.instanceId);
    }
    return this.modalManager;
  }

  private getParent(): HTMLElement {
    if (this.config.container) {
      return this.config.container;
    }
    if (typeof document !== "undefined") {
      return document.body ?? document.documentElement;
    }
    throw new Error("DOM document is not available. Toaster operations require a browser environment.");
  }

  private buildResolvedConfig(config: ToasterConfig): ResolvedToastConfig {
    return {
      instanceId: this.instanceId,
      position: config.position ?? DEFAULT_CONFIG.position,
      duration: config.duration ?? DEFAULT_CONFIG.duration,
      isDismissable: config.isDismissable ?? DEFAULT_CONFIG.isDismissable,
      shouldAutoDismiss: config.shouldAutoDismiss ?? DEFAULT_CONFIG.shouldAutoDismiss,
      maxVisible: config.maxVisible ?? DEFAULT_CONFIG.maxVisible,
      margin: config.margin,
      appearance: config.appearance ?? DEFAULT_CONFIG.appearance,
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
