import type { ResolvedToastConfig } from "../options";
import type { Toast } from "../toast-base";
import type { LoadingToastOptions, ToastHandle, ToasterConfig } from "../types";
import { LoadingToast } from "../variants/loading";

export interface LoadingContext {
  assertAlive(): void;
  getParent(): HTMLElement;
  registerToast(toast: Toast, bucket: Set<Toast>): ToastHandle;
  config: ToasterConfig;
  resolved: ResolvedToastConfig;
  loadingToasts: Set<Toast>;
}

export interface LoadingManager {
  show(options: LoadingToastOptions): ToastHandle;
  clear(): void;
}

export function createLoadingManager(ctx: LoadingContext): LoadingManager {
  return {
    show: (options) => {
      ctx.assertAlive();
      const merged = { ...ctx.config.loading, ...options };
      const toast = new LoadingToast({
        options: merged,
        config: ctx.resolved,
        parent: ctx.getParent(),
      });
      return ctx.registerToast(toast, ctx.loadingToasts);
    },
    clear: () => {
      ctx.assertAlive();
      ctx.loadingToasts.forEach((t) => t.hide());
      ctx.loadingToasts.clear();
    },
  };
}
