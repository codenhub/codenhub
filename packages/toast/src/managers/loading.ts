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

/**
 * Manager interface for dispatching stateful progress/loading toast indicators.
 */
export interface LoadingManager {
  /**
   * Displays a stateful progress loader toast. By default, loading toasts do not auto-dismiss.
   *
   * @param options Configuration options including message and styling tokens.
   * @returns A control handle to interact with or dismiss the loader toast instance.
   */
  show(options: LoadingToastOptions): ToastHandle;

  /**
   * Dismisses all active loading toast notifications.
   */
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
