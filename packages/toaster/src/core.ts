import { removeInstanceContainers } from "./dom";
import { ModalController } from "./modal";
import { DEFAULT_CONFIG, DEFAULT_DISMISS_LABEL, assertToastPosition } from "./options";
import type { RawToastOptions, ResolvedToastConfig } from "./options";
import { Toast } from "./toast-base";
import { reconcileCapacity } from "./toast-helpers";
import { applyGlobalTokens, assertValidTokens, removeGlobalTokens } from "./tokens";
import type {
  AlertOptions,
  ConfirmOptions,
  CustomToastOptions,
  DialogDispatcher,
  LoadingToastOptions,
  PromiseToastOptions,
  PromptOptions,
  ToastContent,
  ToastHandle,
  ToastOptions,
  Toaster,
  ToasterConfig,
  ToasterRuntimeConfig,
  ToastUpdateOptions,
} from "./types";
import { LoadingToast } from "./variants/loading";
import { SemanticToast } from "./variants/semantic";

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
    labels: config.labels ? { ...config.labels } : undefined,
    margin: typeof config.margin === "object" && config.margin !== null ? { ...config.margin } : config.margin,
  };
}

function parseToastArgs(
  messageOrOptions: string | ToastOptions,
  options?: ToastOptions,
): { message?: string; options: ToastOptions } {
  if (typeof messageOrOptions === "string") {
    return { message: messageOrOptions, options: options ?? {} };
  }
  return { message: messageOrOptions.message, options: messageOrOptions };
}

function parseLoadingArgs(
  messageOrOptions?: string | LoadingToastOptions,
  options?: LoadingToastOptions,
): { message?: string; options: LoadingToastOptions } {
  if (typeof messageOrOptions === "string") {
    return { message: messageOrOptions, options: options ?? {} };
  }
  if (messageOrOptions) {
    return { message: messageOrOptions.message, options: messageOrOptions };
  }
  return { message: undefined, options: {} };
}

function parseCustomArgs(
  contentOrOptions: ToastContent | CustomToastOptions,
  options?: CustomToastOptions,
): { content?: ToastContent; options: Omit<CustomToastOptions, "content"> } {
  if (
    typeof contentOrOptions === "string" ||
    typeof contentOrOptions === "function" ||
    (typeof contentOrOptions === "object" && contentOrOptions !== null && "nodeType" in contentOrOptions)
  ) {
    return { content: contentOrOptions as ToastContent, options: options ?? {} };
  }
  const opts = (contentOrOptions ?? {}) as CustomToastOptions;
  return { content: opts.content, options: opts };
}

class ToastManager {
  private config: ToasterConfig;
  private resolved: ResolvedToastConfig;
  private readonly instanceId: string;
  private isDestroyed = false;
  private readonly activeToasts = new Set<Toast>();
  private modalController: ModalController | null = null;

  public readonly dialog: DialogDispatcher = {
    confirm: (message: string, options?: ConfirmOptions) => {
      this.assertAlive();
      return this.getModalController().confirm(message, options);
    },
    prompt: (message: string, options?: PromptOptions) => {
      this.assertAlive();
      return this.getModalController().prompt(message, options);
    },
    alert: (message: string, options?: AlertOptions) => {
      this.assertAlive();
      return this.getModalController().alert(message, options);
    },
  };

  constructor(config: ToasterConfig = {}) {
    this.instanceId = generateInstanceId();
    this.validateConfig(config);
    this.config = copyConfig(config);
    this.resolved = this.buildResolvedConfig(this.config);

    if (this.config.tokens && typeof document !== "undefined") {
      applyGlobalTokens(
        this.config.tokens,
        this.instanceId,
        this.config.container?.ownerDocument ?? document,
        this.config.nonce,
      );
    }
  }

  public show(messageOrOptions: string | ToastOptions, options?: ToastOptions): ToastHandle {
    this.assertAlive();
    const { message, options: parsedOpts } = parseToastArgs(messageOrOptions, options);
    const rawOptions: RawToastOptions = {
      ...parsedOpts,
      message,
      title: parsedOpts.title,
      type: parsedOpts.type ?? "default",
    };
    const toast = new Toast({
      options: rawOptions,
      config: this.resolved,
      parent: this.getParent(),
    });
    return this.registerToast(toast);
  }

  public success(messageOrOptions: string | ToastOptions, options?: ToastOptions): ToastHandle {
    this.assertAlive();
    const { message, options: parsedOpts } = parseToastArgs(messageOrOptions, options);
    const rawOptions: RawToastOptions = {
      ...this.config.semantic,
      ...parsedOpts,
      message,
      title: parsedOpts.title,
      type: "success",
    };
    const toast = new SemanticToast({
      options: rawOptions,
      config: this.resolved,
      parent: this.getParent(),
    });
    return this.registerToast(toast);
  }

  public error(messageOrOptions: string | ToastOptions, options?: ToastOptions): ToastHandle {
    this.assertAlive();
    const { message, options: parsedOpts } = parseToastArgs(messageOrOptions, options);
    const rawOptions: RawToastOptions = {
      ...this.config.semantic,
      ...parsedOpts,
      message,
      title: parsedOpts.title,
      type: "error",
    };
    const toast = new SemanticToast({
      options: rawOptions,
      config: this.resolved,
      parent: this.getParent(),
    });
    return this.registerToast(toast);
  }

  public warning(messageOrOptions: string | ToastOptions, options?: ToastOptions): ToastHandle {
    this.assertAlive();
    const { message, options: parsedOpts } = parseToastArgs(messageOrOptions, options);
    const rawOptions: RawToastOptions = {
      ...this.config.semantic,
      ...parsedOpts,
      message,
      title: parsedOpts.title,
      type: "warning",
    };
    const toast = new SemanticToast({
      options: rawOptions,
      config: this.resolved,
      parent: this.getParent(),
    });
    return this.registerToast(toast);
  }

  public info(messageOrOptions: string | ToastOptions, options?: ToastOptions): ToastHandle {
    this.assertAlive();
    const { message, options: parsedOpts } = parseToastArgs(messageOrOptions, options);
    const rawOptions: RawToastOptions = {
      ...this.config.semantic,
      ...parsedOpts,
      message,
      title: parsedOpts.title,
      type: "info",
    };
    const toast = new SemanticToast({
      options: rawOptions,
      config: this.resolved,
      parent: this.getParent(),
    });
    return this.registerToast(toast);
  }

  public loading(messageOrOptions?: string | LoadingToastOptions, options?: LoadingToastOptions): ToastHandle {
    this.assertAlive();
    const { message, options: parsedOpts } = parseLoadingArgs(messageOrOptions, options);
    const rawOptions: RawToastOptions = {
      ...this.config.loading,
      ...parsedOpts,
      message,
      title: parsedOpts.title,
    };
    const toast = new LoadingToast({
      options: rawOptions,
      config: this.resolved,
      parent: this.getParent(),
    });
    return this.registerToast(toast);
  }

  public custom(contentOrOptions: ToastContent | CustomToastOptions, options?: CustomToastOptions): ToastHandle {
    this.assertAlive();
    const { content, options: parsedOpts } = parseCustomArgs(contentOrOptions, options);
    const rawOptions: RawToastOptions = {
      ...this.config.custom,
      ...parsedOpts,
      content,
    };
    const toast = new Toast({
      options: rawOptions,
      config: this.resolved,
      parent: this.getParent(),
    });
    return this.registerToast(toast);
  }

  public promise<T>(promise: PromiseLike<T>, options: PromiseToastOptions<T>): Promise<T> {
    this.assertAlive();
    const loadingOpts = typeof options.loading === "string" ? { message: options.loading } : options.loading;
    const loadingMsg = loadingOpts.message ?? loadingOpts.title ?? "";
    const handle = this.loading(loadingMsg, {
      ...options,
      ...loadingOpts,
    });

    return Promise.resolve(promise).then(
      (value) => {
        const successResult = typeof options.success === "function" ? options.success(value) : options.success;
        const successOpts: ToastUpdateOptions =
          typeof successResult === "string"
            ? { message: successResult, title: successResult, type: "success", autoDismiss: true }
            : { type: "success", autoDismiss: true, ...successResult };
        handle.update(successOpts);
        return value;
      },
      (error) => {
        const errorResult = typeof options.error === "function" ? options.error(error) : options.error;
        const errorOpts: ToastUpdateOptions =
          typeof errorResult === "string"
            ? { message: errorResult, title: errorResult, type: "error", autoDismiss: true }
            : { type: "error", autoDismiss: true, ...errorResult };
        handle.update(errorOpts);
        throw error;
      },
    );
  }

  public clear(): void {
    this.assertAlive();
    this.activeToasts.forEach((t) => t.hide());
    this.activeToasts.clear();
  }

  public dismiss(handle?: ToastHandle): void {
    this.assertAlive();
    if (handle) {
      handle.dismiss();
    } else {
      this.clear();
    }
  }

  public configure(config: ToasterRuntimeConfig): void {
    this.assertAlive();
    if ("container" in config) {
      throw new Error("Toaster container cannot be changed after construction.");
    }
    const merged = { ...this.config, ...config };
    this.validateConfig(merged);
    const nextConfig = copyConfig(merged);

    if (config.tokens !== undefined) {
      applyGlobalTokens(
        nextConfig.tokens,
        this.instanceId,
        this.resolveParentElement().ownerDocument,
        nextConfig.nonce,
      );
    }

    this.config = nextConfig;
    this.resolved = this.buildResolvedConfig(this.config);

    if (config.maxVisible !== undefined) {
      reconcileCapacity({
        parent: this.getParent(),
        instanceId: this.instanceId,
        maxVisible: this.resolved.maxVisible,
      });
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

    this.activeToasts.forEach((t) => t.destroyImmediately());
    this.activeToasts.clear();

    if (this.modalController) {
      this.modalController.destroy();
      this.modalController = null;
    }

    if (this.config.container || typeof document !== "undefined") {
      const parent = this.getParent();
      removeInstanceContainers({ parent, instanceId: this.instanceId });
    }
    removeGlobalTokens(this.instanceId);
  }

  private registerToast(toast: Toast): ToastHandle {
    this.activeToasts.add(toast);
    void this.removeWhenSettled(toast, this.activeToasts);
    toast.show();
    return toast.handle;
  }

  private getModalController(): ModalController {
    if (!this.modalController) {
      this.modalController = new ModalController(
        this.getParent(),
        this.instanceId,
        () => this.resolved.className,
        () => this.resolved.dialogLabels,
      );
    }
    return this.modalController;
  }

  private resolveParentElement(): HTMLElement {
    if (this.config.container) {
      return this.config.container;
    }
    if (typeof document !== "undefined") {
      return document.body ?? document.documentElement;
    }
    throw new Error("DOM document is not available. Toaster operations require a browser environment.");
  }

  private getParent(): HTMLElement {
    const parent = this.resolveParentElement();
    if (this.config.tokens) {
      applyGlobalTokens(this.config.tokens, this.instanceId, parent.ownerDocument, this.config.nonce);
    }
    return parent;
  }

  private buildResolvedConfig(config: ToasterConfig): ResolvedToastConfig {
    return {
      instanceId: this.instanceId,
      position: config.position ?? DEFAULT_CONFIG.position,
      duration: config.duration ?? DEFAULT_CONFIG.duration,
      dismissible: config.dismissible ?? config.closeButton ?? DEFAULT_CONFIG.dismissible,
      autoDismiss: config.autoDismiss ?? DEFAULT_CONFIG.autoDismiss,
      maxVisible: config.maxVisible ?? DEFAULT_CONFIG.maxVisible,
      margin: config.margin,
      className: config.className,
      dismissLabel: config.labels?.dismiss ?? DEFAULT_DISMISS_LABEL,
      dialogLabels: config.labels ?? {},
    };
  }

  private validateConfig(config: ToasterConfig): void {
    if (config.position !== undefined) {
      assertToastPosition(config.position);
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
 * Consumers who want a singleton can use the default `toast` export.
 *
 * @param config Optional initial configuration overrides for the toaster.
 * @returns An independent Toaster instance controller.
 * @throws {Error} If duration, max-visible count, or token colors are invalid.
 */
export function createToaster(config?: ToasterConfig): Toaster {
  const manager = new ToastManager(config);

  const toaster = Object.assign(
    (messageOrOptions: string | ToastOptions, options?: ToastOptions) => manager.show(messageOrOptions, options),
    {
      success: (messageOrOptions: string | ToastOptions, options?: ToastOptions) =>
        manager.success(messageOrOptions, options),
      error: (messageOrOptions: string | ToastOptions, options?: ToastOptions) =>
        manager.error(messageOrOptions, options),
      warning: (messageOrOptions: string | ToastOptions, options?: ToastOptions) =>
        manager.warning(messageOrOptions, options),
      info: (messageOrOptions: string | ToastOptions, options?: ToastOptions) =>
        manager.info(messageOrOptions, options),
      loading: (messageOrOptions?: string | LoadingToastOptions, options?: LoadingToastOptions) =>
        manager.loading(messageOrOptions, options),
      custom: (contentOrOptions: ToastContent | CustomToastOptions, options?: CustomToastOptions) =>
        manager.custom(contentOrOptions, options),
      promise: <T>(promise: PromiseLike<T>, options: PromiseToastOptions<T>) => manager.promise(promise, options),
      dialog: manager.dialog,
      clear: () => manager.clear(),
      dismiss: (handle?: ToastHandle) => manager.dismiss(handle),
      configure: (runtimeConfig: ToasterRuntimeConfig) => manager.configure(runtimeConfig),
      destroy: () => manager.destroy(),
    },
  );

  return toaster as Toaster;
}

/** Pre-configured default browser singleton for notifications. */
export const toast: Toaster = createToaster();

/** Pre-configured default browser singleton for interactive dialogs. */
export const dialog: DialogDispatcher = toast.dialog;
