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

/**
 * Manager interface for dispatching pre-styled semantic notifications (success, error, warning, info).
 */
export interface SemanticManager {
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
