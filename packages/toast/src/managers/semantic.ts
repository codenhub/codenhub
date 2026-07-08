import type { ResolvedToastConfig } from "../options";
import type { Toast } from "../toast-base";
import type { SemanticToastOptions, SemanticType, ToastHandle, ToasterConfig } from "../types";
import { SemanticToast } from "../variants/semantic";

export interface SemanticContext {
  assertAlive(): void;
  getParent(): HTMLElement;
  registerToast(toast: Toast, bucket: Set<Toast>): ToastHandle;
  config: ToasterConfig;
  resolved: ResolvedToastConfig;
  semanticToasts: Set<Toast>;
}

export interface SemanticManager {
  show(options: SemanticToastOptions & { type?: SemanticType }): ToastHandle;
  success(message: string, options?: Omit<SemanticToastOptions, "message">): ToastHandle;
  error(message: string, options?: Omit<SemanticToastOptions, "message">): ToastHandle;
  warning(message: string, options?: Omit<SemanticToastOptions, "message">): ToastHandle;
  info(message: string, options?: Omit<SemanticToastOptions, "message">): ToastHandle;
  clear(): void;
}

export function createSemanticManager(ctx: SemanticContext): SemanticManager {
  const showSemantic = (
    type: SemanticType,
    message: string,
    options?: Omit<SemanticToastOptions, "message">,
  ): ToastHandle => {
    ctx.assertAlive();
    const merged = { ...ctx.config.semantic, ...options, message, type };
    const toast = new SemanticToast({
      options: merged,
      config: ctx.resolved,
      parent: ctx.getParent(),
    });
    return ctx.registerToast(toast, ctx.semanticToasts);
  };

  return {
    show: (options) => {
      ctx.assertAlive();
      const merged = { ...ctx.config.semantic, ...options };
      const toast = new SemanticToast({
        options: merged,
        config: ctx.resolved,
        parent: ctx.getParent(),
      });
      return ctx.registerToast(toast, ctx.semanticToasts);
    },
    success: (msg, opts) => showSemantic("success", msg, opts),
    error: (msg, opts) => showSemantic("error", msg, opts),
    warning: (msg, opts) => showSemantic("warning", msg, opts),
    info: (msg, opts) => showSemantic("info", msg, opts),
    clear: () => {
      ctx.assertAlive();
      ctx.semanticToasts.forEach((t) => t.hide());
      ctx.semanticToasts.clear();
    },
  };
}
