import type { ResolvedToastConfig } from "../options";
import { Toast } from "../toast-base";
import type { CustomToastOptions, ToastHandle, ToasterConfig } from "../types";

export interface CustomContext {
  assertAlive(): void;
  getParent(): HTMLElement;
  registerToast(toast: Toast, bucket: Set<Toast>): ToastHandle;
  config: ToasterConfig;
  resolved: ResolvedToastConfig;
  customToasts: Set<Toast>;
}

export interface CustomManager {
  show(options: CustomToastOptions): ToastHandle;
  clear(): void;
}

export function createCustomManager(ctx: CustomContext): CustomManager {
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
