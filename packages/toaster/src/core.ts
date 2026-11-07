import { applyInstanceMargin, applyInstanceRegionLabel, removeInstanceContainers } from "./dom";
import { generateInstanceId } from "./instance-id";
import {
  DEFAULT_CONFIG,
  DEFAULT_DISMISS_LABEL,
  DEFAULT_REGION_LABEL,
  assertToastPosition,
  withoutUndefined,
} from "./options";
import type { RawToastOptions, ResolvedToastConfig } from "./options";
import { Toast, reportUncaughtError } from "./toast-base";
import { reconcileCapacity } from "./toast-helpers";
import type {
  CustomToastOptions,
  LoadingToastOptions,
  PromiseToastOptions,
  SemanticType,
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

function copyConfig(config: ToasterConfig): ToasterConfig {
  return {
    ...config,
    semantic: config.semantic ? { ...config.semantic } : undefined,
    loading: config.loading ? { ...config.loading } : undefined,
    custom: config.custom ? { ...config.custom } : undefined,
    labels: config.labels ? { ...config.labels } : undefined,
    margin: typeof config.margin === "object" && config.margin !== null ? { ...config.margin } : config.margin,
  };
}

function isInvalidDuration(duration: number | undefined): boolean {
  return duration !== undefined && (!Number.isFinite(duration) || duration < 0);
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

type InternalLoadingOptions = LoadingToastOptions & { duration?: number };

function parseLoadingArgs(
  messageOrOptions?: string | InternalLoadingOptions,
  options?: InternalLoadingOptions,
): { message?: string; options: InternalLoadingOptions } {
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
  options?: Omit<CustomToastOptions, "content">,
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

/** The settings a promise's outcome falls back to when its own options leave them unset. */
interface PromiseOutcomeDefaults {
  duration?: number;
  dismissible?: boolean;
  autoDismiss: boolean;
}

function toStructuredPromiseUpdate(
  result: string | ToastOptions,
  type: SemanticType,
  defaults: PromiseOutcomeDefaults,
): ToastUpdateOptions {
  const options = typeof result === "string" ? { message: result } : result;
  return {
    type,
    autoDismiss: options.autoDismiss ?? defaults.autoDismiss,
    message: options.message ?? null,
    title: options.title ?? null,
    description: options.description ?? null,
    action: options.action ?? null,
    icon: options.icon,
    duration: options.duration ?? defaults.duration,
    dismissible: options.dismissible ?? defaults.dismissible,
    className: options.className,
  };
}

class ToastManager {
  private config: ToasterConfig;
  private resolved: ResolvedToastConfig;
  private readonly instanceId: string;
  private isDestroyed = false;
  private readonly activeToasts = new Set<Toast>();

  constructor(config: ToasterConfig = {}) {
    this.instanceId = generateInstanceId();
    this.validateConfig(config);
    this.config = copyConfig(config);
    this.resolved = this.buildResolvedConfig(this.config);
  }

  public show(messageOrOptions: string | ToastOptions, options?: ToastOptions): ToastHandle {
    return this.showMessage(Toast, undefined, undefined, messageOrOptions, options);
  }

  /** Shows a `success`, `error`, `warning`, or `info` toast over the instance's `semantic` defaults. */
  public semantic(type: SemanticType, messageOrOptions: string | ToastOptions, options?: ToastOptions): ToastHandle {
    return this.showMessage(SemanticToast, this.config.semantic, type, messageOrOptions, options);
  }

  public loading(messageOrOptions?: string | InternalLoadingOptions, options?: InternalLoadingOptions): ToastHandle {
    this.assertAlive();
    const { message, options: parsedOpts } = parseLoadingArgs(messageOrOptions, options);
    return this.dispatch(LoadingToast, {
      ...this.config.loading,
      ...withoutUndefined(parsedOpts),
      message,
      title: parsedOpts.title,
    });
  }

  public custom(
    contentOrOptions: ToastContent | CustomToastOptions,
    options?: Omit<CustomToastOptions, "content">,
  ): ToastHandle {
    this.assertAlive();
    const { content, options: parsedOpts } = parseCustomArgs(contentOrOptions, options);
    return this.dispatch(Toast, {
      ...this.config.custom,
      ...withoutUndefined(parsedOpts),
      content,
    });
  }

  public promise<T>(promise: PromiseLike<T>, options: PromiseToastOptions<T>): Promise<T> {
    this.assertAlive();
    const loadingOpts = typeof options.loading === "string" ? { message: options.loading } : options.loading;
    const handle = this.loading({
      ...options,
      ...withoutUndefined(loadingOpts),
      duration: options.duration,
    });

    // A throwing formatter must not strand the loader (it is neither
    // dismissible nor evictable) or replace the caller's outcome, so its
    // error is reported and the loader is dismissed instead.
    // The outcome is a semantic toast, so the call's own settings win, then
    // the instance's `semantic` defaults. `autoDismiss` also falls back to
    // the instance-wide setting, because `update()` would otherwise reset it
    // to `true` when the toast leaves the loading state.
    const outcomeDefaults: PromiseOutcomeDefaults = {
      duration: options.duration ?? this.config.semantic?.duration,
      dismissible: options.dismissible ?? this.config.semantic?.dismissible,
      autoDismiss: this.config.semantic?.autoDismiss ?? this.resolved.autoDismiss,
    };
    const settle = (type: SemanticType, format: () => string | ToastOptions): void => {
      try {
        handle.update(toStructuredPromiseUpdate(format(), type, outcomeDefaults));
      } catch (formatError) {
        reportUncaughtError(formatError);
        handle.dismiss();
      }
    };

    return Promise.resolve(promise).then(
      (value) => {
        settle("success", () => (typeof options.success === "function" ? options.success(value) : options.success));
        return value;
      },
      (error) => {
        settle("error", () => (typeof options.error === "function" ? options.error(error) : options.error));
        throw error;
      },
    );
  }

  public clear(): void {
    this.assertAlive();
    // Leaving toasts stay tracked until they settle, so destroy() can still
    // settle them immediately.
    this.activeToasts.forEach((t) => t.hide());
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
    this.config = copyConfig(merged);
    this.resolved = this.buildResolvedConfig(this.config);

    if (config.maxVisible !== undefined) {
      reconcileCapacity({
        parent: this.getParent(),
        instanceId: this.instanceId,
        maxVisible: this.resolved.maxVisible,
      });
    }

    if ("labels" in config) {
      applyInstanceRegionLabel({
        parent: this.getParent(),
        instanceId: this.instanceId,
        label: this.resolved.regionLabel,
      });
    }

    if (config.margin !== undefined) {
      applyInstanceMargin({ parent: this.getParent(), instanceId: this.instanceId, margin: config.margin });
    }
  }

  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;

    this.activeToasts.forEach((t) => t.destroyImmediately());
    this.activeToasts.clear();

    if (this.config.container || typeof document !== "undefined") {
      const parent = this.getParent();
      removeInstanceContainers({ parent, instanceId: this.instanceId });
    }
  }

  /**
   * Shows a message toast: `defaults` first, then the call's own options,
   * with `type` falling back to the call's own, then `"default"`.
   */
  private showMessage(
    ToastClass: typeof Toast,
    defaults: ToastOptions | undefined,
    type: SemanticType | undefined,
    messageOrOptions: string | ToastOptions,
    options?: ToastOptions,
  ): ToastHandle {
    this.assertAlive();
    const { message, options: parsedOpts } = parseToastArgs(messageOrOptions, options);
    return this.dispatch(ToastClass, {
      ...defaults,
      ...withoutUndefined(parsedOpts),
      message,
      title: parsedOpts.title,
      type: type ?? parsedOpts.type ?? "default",
    });
  }

  private dispatch(ToastClass: typeof Toast, options: RawToastOptions): ToastHandle {
    const toast = new ToastClass({ options, config: this.resolved, parent: this.getParent() });
    this.activeToasts.add(toast);
    void this.removeWhenSettled(toast, this.activeToasts);
    toast.show();
    return toast.handle;
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
      dismissible: config.dismissible ?? DEFAULT_CONFIG.dismissible,
      autoDismiss: config.autoDismiss ?? DEFAULT_CONFIG.autoDismiss,
      maxVisible: config.maxVisible ?? DEFAULT_CONFIG.maxVisible,
      margin: config.margin,
      className: config.className,
      dismissLabel: config.labels?.dismiss ?? DEFAULT_DISMISS_LABEL,
      regionLabel: config.labels?.notifications ?? DEFAULT_REGION_LABEL,
    };
  }

  private validateConfig(config: ToasterConfig): void {
    [config.position, config.semantic?.position, config.loading?.position, config.custom?.position].forEach(
      (position) => {
        if (position !== undefined) {
          assertToastPosition(position);
        }
      },
    );
    if (isInvalidDuration(config.duration)) {
      throw new Error("Toaster duration must be a finite number greater than or equal to 0.");
    }
    if (config.maxVisible !== undefined && (!Number.isInteger(config.maxVisible) || config.maxVisible <= 0)) {
      throw new Error("Toaster maxVisible must be a positive integer.");
    }
    for (const duration of [config.semantic?.duration, config.custom?.duration]) {
      if (isInvalidDuration(duration)) {
        throw new Error("Toaster nested duration must be a finite number greater than or equal to 0.");
      }
    }
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
        manager.semantic("success", messageOrOptions, options),
      error: (messageOrOptions: string | ToastOptions, options?: ToastOptions) =>
        manager.semantic("error", messageOrOptions, options),
      warning: (messageOrOptions: string | ToastOptions, options?: ToastOptions) =>
        manager.semantic("warning", messageOrOptions, options),
      info: (messageOrOptions: string | ToastOptions, options?: ToastOptions) =>
        manager.semantic("info", messageOrOptions, options),
      loading: (messageOrOptions?: string | LoadingToastOptions, options?: LoadingToastOptions) =>
        manager.loading(messageOrOptions, options),
      custom: (contentOrOptions: ToastContent | CustomToastOptions, options?: Omit<CustomToastOptions, "content">) =>
        manager.custom(contentOrOptions, options),
      promise: <T>(promise: PromiseLike<T>, options: PromiseToastOptions<T>) => manager.promise(promise, options),
      clear: () => manager.clear(),
      dismiss: (handle?: ToastHandle) => manager.dismiss(handle),
      configure: (runtimeConfig: ToasterRuntimeConfig) => manager.configure(runtimeConfig),
      destroy: () => manager.destroy(),
    },
  );

  return toaster as Toaster;
}

/**
 * Pre-configured default browser singleton for notifications. Marked pure so
 * a bundler drops it, and with it the whole package, when nothing uses it.
 * The package declares no side effects.
 */
export const toast: Toaster = /* @__PURE__ */ createToaster();
