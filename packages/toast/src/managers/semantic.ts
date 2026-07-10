import type { BaseContext } from "../core";
import type { Toast } from "../toast-base";
import type { SemanticToastOptions, SemanticType, ToastHandle } from "../types";
import { SemanticToast } from "../variants/semantic";

export interface SemanticContext extends BaseContext {
  semanticToasts: Set<Toast>;
}

/**
 * Dispatcher interface for sending pre-styled semantic notifications (success, error, warning, info).
 */
export interface SemanticDispatcher {
  /**
   * Displays a semantic toast notification with custom options.
   *
   * @param options Scoped options including type, message, duration, and styling tokens.
   * @returns A control handle to interact with the toast instance.
   */
  show(options: SemanticToastOptions & { type?: SemanticType }): ToastHandle;

  /**
   * Displays a success notification.
   *
   * @param message Description text of the notification.
   * @param options Extensible layout and timing options.
   * @returns A control handle to interact with the toast instance.
   */
  success(message: string, options?: Omit<SemanticToastOptions, "message">): ToastHandle;

  /**
   * Displays an error notification.
   *
   * @param message Description text of the notification.
   * @param options Extensible layout and timing options.
   * @returns A control handle to interact with the toast instance.
   */
  error(message: string, options?: Omit<SemanticToastOptions, "message">): ToastHandle;

  /**
   * Displays a warning notification.
   *
   * @param message Description text of the notification.
   * @param options Extensible layout and timing options.
   * @returns A control handle to interact with the toast instance.
   */
  warning(message: string, options?: Omit<SemanticToastOptions, "message">): ToastHandle;

  /**
   * Displays an informational notification.
   *
   * @param message Description text of the notification.
   * @param options Extensible layout and timing options.
   * @returns A control handle to interact with the toast instance.
   */
  info(message: string, options?: Omit<SemanticToastOptions, "message">): ToastHandle;

  /**
   * Dismisses all active semantic toast notifications.
   */
  clear(): void;
}

export function createSemanticDispatcher(ctx: SemanticContext): SemanticDispatcher {
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
