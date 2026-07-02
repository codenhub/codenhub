import { Toast } from "./toast-base";
import type { ToastOptions, ConfirmToastOptions, PromptToastOptions, AlertToastOptions } from "./types";
import { AlertToast } from "./variants/alert";
import { ConfirmToast } from "./variants/confirm";
import { LoadingToast } from "./variants/loading";
import { PromptToast } from "./variants/prompt";
import { SemanticToast } from "./variants/semantic";

export { Toast } from "./toast-base";

export interface ToasterConfig {
  replaceNative?: boolean;
  defaults?: Partial<ToastOptions>;
}

export interface Toaster {
  showToast(options: ToastOptions): Toast;
  success(message: string, options?: Partial<ToastOptions>): Toast;
  error(message: string, options?: Partial<ToastOptions>): Toast;
  warning(message: string, options?: Partial<ToastOptions>): Toast;
  info(message: string, options?: Partial<ToastOptions>): Toast;
  loading(message: string, options?: Partial<ToastOptions>): Toast;
  confirm(message: string, options?: ConfirmToastOptions): Promise<boolean>;
  prompt(message: string, defaultValue?: string, options?: PromptToastOptions): Promise<string | null>;
  alert(message: string, options?: AlertToastOptions): Promise<void>;
  clear(): void;
  configure(config: ToasterConfig): void;
}

class ToastManager implements Toaster {
  private activeToasts = new Set<Toast>();
  private config: ToasterConfig;
  private originalAlert = typeof window !== "undefined" ? window.alert : undefined;
  private originalConfirm = typeof window !== "undefined" ? window.confirm : undefined;
  private originalPrompt = typeof window !== "undefined" ? window.prompt : undefined;

  constructor(config: ToasterConfig = {}) {
    this.config = config;
    if (config.replaceNative) {
      this.replaceNativeAPIs();
    }
  }

  public configure(config: ToasterConfig): void {
    const oldReplaceNative = this.config.replaceNative;
    this.config = { ...this.config, ...config };

    if (config.replaceNative && !oldReplaceNative) {
      this.replaceNativeAPIs();
    } else if (config.replaceNative === false && oldReplaceNative) {
      this.restoreNativeAPIs();
    }
  }

  private replaceNativeAPIs(): void {
    if (typeof window === "undefined") {
      return;
    }
    window.alert = (message) => {
      void this.alert(String(message));
    };
    // @ts-expect-error override with async signature
    window.confirm = (message) => {
      return this.confirm(String(message));
    };
    // @ts-expect-error override with async signature
    window.prompt = (message, defaultValue) => {
      return this.prompt(String(message), defaultValue ?? "");
    };
  }

  private restoreNativeAPIs(): void {
    if (typeof window === "undefined") {
      return;
    }
    if (this.originalAlert) {
      window.alert = this.originalAlert;
    }
    if (this.originalConfirm) {
      window.confirm = this.originalConfirm;
    }
    if (this.originalPrompt) {
      window.prompt = this.originalPrompt;
    }
  }

  private registerToast(toast: Toast): Toast {
    this.activeToasts.add(toast);
    toast.onHidden(() => {
      this.activeToasts.delete(toast);
    });
    toast.show();
    return toast;
  }

  public showToast(options: ToastOptions): Toast {
    const toast = new Toast({
      ...this.config.defaults,
      ...options,
    });
    return this.registerToast(toast);
  }

  public success(message: string, options?: Partial<ToastOptions>): Toast {
    const toast = new SemanticToast({
      type: "success",
      message,
      ...this.config.defaults,
      ...options,
    });
    return this.registerToast(toast);
  }

  public error(message: string, options?: Partial<ToastOptions>): Toast {
    const toast = new SemanticToast({
      type: "error",
      message,
      ...this.config.defaults,
      ...options,
    });
    return this.registerToast(toast);
  }

  public warning(message: string, options?: Partial<ToastOptions>): Toast {
    const toast = new SemanticToast({
      type: "warning",
      message,
      ...this.config.defaults,
      ...options,
    });
    return this.registerToast(toast);
  }

  public info(message: string, options?: Partial<ToastOptions>): Toast {
    const toast = new SemanticToast({
      type: "info",
      message,
      ...this.config.defaults,
      ...options,
    });
    return this.registerToast(toast);
  }

  public loading(message: string, options?: Partial<ToastOptions>): Toast {
    const toast = new LoadingToast({
      message,
      ...this.config.defaults,
      ...options,
    });
    return this.registerToast(toast);
  }

  public confirm(message: string, options?: ConfirmToastOptions): Promise<boolean> {
    const toast = new ConfirmToast(message, {
      ...this.config.defaults,
      ...options,
    });
    this.registerToast(toast);
    return toast.promise;
  }

  public prompt(message: string, defaultValue = "", options?: PromptToastOptions): Promise<string | null> {
    const toast = new PromptToast(message, defaultValue, {
      ...this.config.defaults,
      ...options,
    });
    this.registerToast(toast);
    return toast.promise;
  }

  public alert(message: string, options?: AlertToastOptions): Promise<void> {
    const toast = new AlertToast(message, {
      ...this.config.defaults,
      ...options,
    });
    this.registerToast(toast);
    return toast.promise;
  }

  public clear(): void {
    this.activeToasts.forEach((toast) => toast.hide());
    this.activeToasts.clear();
  }
}

let toasterInstance: Toaster | null = null;

export function createToaster(config?: ToasterConfig): Toaster {
  if (!toasterInstance) {
    toasterInstance = new ToastManager(config);
  } else if (config) {
    toasterInstance.configure(config);
  }
  return toasterInstance;
}
