import type { BaseContext } from "../core";
import type { Toast } from "../toast-base";
import type { LoadingToastOptions, ToastHandle } from "../types";
import { LoadingToast } from "../variants/loading";

export interface LoadingContext extends BaseContext {
  loadingToasts: Set<Toast>;
}

/**
 * Dispatcher interface for sending stateful progress/loading toast indicators.
 */
export interface LoadingDispatcher {
  /**
   * Displays a stateful progress loader toast. By default, loading toasts do not auto-dismiss.
   *
   * @param options Configuration options including message and styling tokens.
   * @returns A control handle to interact with or dismiss the loader toast instance.
   * @throws {Error} If the instance is destroyed, the message is empty, tokens are invalid, or no DOM is available.
   */
  show(options: LoadingToastOptions): ToastHandle;

  /**
   * Dismisses all active loading toast notifications.
   *
   * @throws {Error} If the toaster instance has been destroyed.
   */
  clear(): void;
}

export function createLoadingDispatcher(ctx: LoadingContext): LoadingDispatcher {
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
