import type { BaseContext } from "../core";
import { Toast } from "../toast-base";
import type { CustomToastOptions, ToastHandle } from "../types";

export interface CustomContext extends BaseContext {
  customToasts: Set<Toast>;
}

/**
 * Dispatcher interface for sending custom DOM-rendered layouts.
 */
export interface CustomDispatcher {
  /**
   * Displays a custom HTML string, DOM Node, or creator function as a toast.
   *
   * @param options Configuration options including custom content, placement, and duration.
   * @returns A control handle to interact with the toast instance.
   * @throws {Error} If the instance is destroyed, content is empty, duration is invalid, or no DOM is available.
   */
  show(options: CustomToastOptions): ToastHandle;

  /**
   * Dismisses all active custom toast notifications.
   *
   * @throws {Error} If the toaster instance has been destroyed.
   */
  clear(): void;
}

export function createCustomDispatcher(ctx: CustomContext): CustomDispatcher {
  return {
    show: (options) => {
      ctx.assertAlive();
      const merged = { ...ctx.config.custom, ...options };
      const toast = new Toast({
        options: merged,
        config: ctx.resolved,
        parent: ctx.getParent(),
      });
      return ctx.registerToast(toast, ctx.customToasts);
    },
    clear: () => {
      ctx.assertAlive();
      ctx.customToasts.forEach((t) => t.hide());
      ctx.customToasts.clear();
    },
  };
}
