import { removeInstanceContainers } from "./dom";
import { createCustomDispatcher } from "./managers/custom";
import type { CustomContext, CustomDispatcher } from "./managers/custom";
import { createInteractiveDispatcher } from "./managers/interactive";
import type { InteractiveDispatcher } from "./managers/interactive";
import { createLoadingDispatcher } from "./managers/loading";
import type { LoadingContext, LoadingDispatcher } from "./managers/loading";
import { createSemanticDispatcher } from "./managers/semantic";
import type { SemanticContext, SemanticDispatcher } from "./managers/semantic";
import { ModalController } from "./modal";
import { DEFAULT_CONFIG, assertToastAppearance, assertToastPosition } from "./options";
import type { ResolvedToastConfig } from "./options";
import type { Toast } from "./toast-base";
import { applyGlobalTokens, assertValidTokens, removeGlobalTokens } from "./tokens";
import type { ToasterConfig, ToasterRuntimeConfig, ToastHandle, ToastUpdateOptions } from "./types";

export type { SemanticDispatcher } from "./managers/semantic";
export type { LoadingDispatcher } from "./managers/loading";
export type { CustomDispatcher } from "./managers/custom";
export type { InteractiveDispatcher } from "./managers/interactive";

let instanceCounter = 0;
function generateInstanceId(): string {
  const randomId =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `coden-toast-${randomId}-${++instanceCounter}`;
}

function copyConfig(config: ToasterConfig): ToasterConfig {
  return {
    ...config,
    tokens: config.tokens ? { ...config.tokens } : undefined,
    semantic: config.semantic ? { ...config.semantic } : undefined,
    loading: config.loading ? { ...config.loading } : undefined,
    custom: config.custom ? { ...config.custom } : undefined,
    margin: typeof config.margin === "object" ? { ...config.margin } : config.margin,
  };
}

export interface BaseContext {
  assertAlive(): void;
  getParent(): HTMLElement;
  registerToast(toast: Toast, bucket: Set<Toast>): ToastHandle;
  readonly config: ToasterConfig;
  readonly resolved: ResolvedToastConfig;
}

function makeHandle(toast: Toast): ToastHandle {
  const handle: ToastHandle = {
    dismiss: () => toast.hide(),
    update: (opts: ToastUpdateOptions) => toast.update(opts),
    get settled(): Promise<void> {
      return toast.settled;
    },
    get state() {
      return toast.publicState;
    },
    onShow: (sub) => toast.onShow(sub),
    onShown: (sub) => toast.onShown(sub),
    onHide: (sub) => toast.onHide(sub),
    onHidden: (sub) => toast.onHidden(sub),
  };
  toast.setHandle(handle);
  return handle;
}

/**
 * Represents the main Toaster instance controller.
 */
export interface Toaster {
  /** Semantic toast dispatcher. */
  readonly semantic: SemanticDispatcher;
  /** Loading indicator dispatcher. */
  readonly loading: LoadingDispatcher;
  /** Interactive native dialog dispatcher. */
  readonly interactive: InteractiveDispatcher;
  /** Custom DOM layout dispatcher. */
  readonly custom: CustomDispatcher;

  /**
   * Clear all active, non-interactive toasts.
   *
   * @throws {Error} If the toaster instance has been destroyed.
   */
  clear(): void;

  /**
   * Reconfigure the toaster at runtime.
   * The construction-time container cannot be changed.
   *
   * @param config Runtime configuration to validate and apply.
   * @throws {Error} If the instance is destroyed or configuration is invalid.
   */
  configure(config: ToasterRuntimeConfig): void;

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

  private modalController: ModalController | null = null;

  public readonly semantic: SemanticDispatcher;
  public readonly loading: LoadingDispatcher;
  public readonly interactive: InteractiveDispatcher;
  public readonly custom: CustomDispatcher;

  constructor(config: ToasterConfig = {}) {
    this.instanceId = generateInstanceId();
    this.validateConfig(config);
    this.config = copyConfig(config);
    this.resolved = this.buildResolvedConfig(this.config);

    if (this.config.tokens && typeof document !== "undefined") {
      applyGlobalTokens(this.config.tokens, this.instanceId, this.config.container?.ownerDocument ?? document);
    }

    const getContextConfig = () => this.config;
    const getContextResolved = () => this.resolved;
    const buildContext = <T extends object>(extra: T): BaseContext & T => {
      return {
        assertAlive: () => this.assertAlive(),
        getParent: () => this.getParent(),
        registerToast: (toast: Toast, bucket: Set<Toast>) => this.registerToast(toast, bucket),
        get config() {
          return getContextConfig();
        },
        get resolved() {
          return getContextResolved();
        },
        ...extra,
      };
    };

    this.semantic = createSemanticDispatcher(buildContext({ semanticToasts: this.semanticToasts }) as SemanticContext);
    this.loading = createLoadingDispatcher(buildContext({ loadingToasts: this.loadingToasts }) as LoadingContext);
    this.custom = createCustomDispatcher(buildContext({ customToasts: this.customToasts }) as CustomContext);
    this.interactive = createInteractiveDispatcher({
      assertAlive: () => this.assertAlive(),
      getModalController: () => this.getModalController(),
    });
  }

  public clear(): void {
    this.assertAlive();
    this.semantic.clear();
    this.loading.clear();
    this.custom.clear();
  }

  public configure(config: ToasterRuntimeConfig): void {
    this.assertAlive();
    if ("container" in config) {
      throw new Error("Toaster container cannot be changed after construction.");
    }
    this.validateConfig({ ...this.config, ...config });
    this.config = copyConfig({ ...this.config, ...config });
    this.resolved = this.buildResolvedConfig(this.config);

    if (config.tokens !== undefined) {
      const parent = this.getParent();
      applyGlobalTokens(this.config.tokens, this.instanceId, parent.ownerDocument);
    }

    if (config.margin !== undefined) {
      const parent = this.getParent();
      parent.querySelectorAll(`[data-toast-container][data-toast-instance="${this.instanceId}"]`).forEach((el) => {
        if (el.tagName === "DIV") {
          const container = el as HTMLDivElement;
          const margin = config.margin;
          if (margin) {
            if (typeof margin === "string") {
              container.style.setProperty("--toast-margin-x", margin);
              container.style.setProperty("--toast-margin-y", margin);
            } else {
              if (margin.x) {
                container.style.setProperty("--toast-margin-x", margin.x);
              } else {
                container.style.removeProperty("--toast-margin-x");
              }
              if (margin.y) {
                container.style.setProperty("--toast-margin-y", margin.y);
              } else {
                container.style.removeProperty("--toast-margin-y");
              }
            }
          } else {
            container.style.removeProperty("--toast-margin-x");
            container.style.removeProperty("--toast-margin-y");
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

    if (this.modalController) {
      this.modalController.destroy();
      this.modalController = null;
    }

    const parent = this.getParent();
    removeInstanceContainers({ parent, instanceId: this.instanceId });
    removeGlobalTokens(this.instanceId);
  }

  private registerToast(toast: Toast, bucket: Set<Toast>): ToastHandle {
    bucket.add(toast);
    void this.removeWhenSettled(toast, bucket);
    const handle = makeHandle(toast);
    toast.show();
    return handle;
  }

  private getModalController(): ModalController {
    if (!this.modalController) {
      this.modalController = new ModalController(this.getParent(), this.instanceId);
    }
    return this.modalController;
  }

  private getParent(): HTMLElement {
    if (this.config.container) {
      if (this.config.tokens) {
        applyGlobalTokens(this.config.tokens, this.instanceId, this.config.container.ownerDocument);
      }
      return this.config.container;
    }
    if (typeof document !== "undefined") {
      const parent = document.body ?? document.documentElement;
      if (this.config.tokens) {
        applyGlobalTokens(this.config.tokens, this.instanceId, parent.ownerDocument);
      }
      return parent;
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

  private validateConfig(config: ToasterConfig): void {
    if (config.position !== undefined) {
      assertToastPosition(config.position);
    }
    if (config.appearance !== undefined) {
      assertToastAppearance(config.appearance);
    }
    [config.semantic?.position, config.loading?.position, config.custom?.position].forEach((position) => {
      if (position !== undefined) {
        assertToastPosition(position);
      }
    });
    if (config.duration !== undefined && (!Number.isFinite(config.duration) || config.duration < 0)) {
      throw new Error("Toaster duration must be a finite number greater than or equal to 0.");
    }
    if (config.maxVisible !== undefined && (!Number.isInteger(config.maxVisible) || config.maxVisible <= 0)) {
      throw new Error("Toaster maxVisible must be a positive integer.");
    }
    for (const duration of [config.semantic?.duration, config.custom?.duration]) {
      if (duration !== undefined && (!Number.isFinite(duration) || duration < 0)) {
        throw new Error("Toaster nested duration must be a finite number greater than or equal to 0.");
      }
    }
    assertValidTokens(
      config.tokens,
      config.container?.ownerDocument ?? (typeof document === "undefined" ? undefined : document),
    );
  }

  private async removeWhenSettled(toast: Toast, bucket: Set<Toast>): Promise<void> {
    await toast.settled;
    bucket.delete(toast);
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
 * @throws {Error} If duration, max-visible count, or token colors are invalid.
 */
export function createToaster(config?: ToasterConfig): Toaster {
  return new ToastManager(config);
}
