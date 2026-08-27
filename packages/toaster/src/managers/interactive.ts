import type { ModalController } from "../modal";
import type { AlertOptions, ConfirmOptions, InteractiveToastHandle, PromptOptions } from "../types";

export interface InteractiveContext {
  assertAlive(): void;
  getModalController(): ModalController;
}

/**
 * Dispatcher interface for displaying interactive browser-native modal dialogs.
 */
export interface InteractiveDispatcher {
  /**
   * Displays a confirmation modal dialog with confirm and cancel buttons.
   *
   * @param message The confirmation message or question text.
   * @param options Configuration options for labels and backdrop behavior.
   * @returns An interactive handle containing the user decision promise.
   * @throws {Error} If the instance is destroyed, the message is empty, or no DOM is available.
   * The handle result rejects if native dialog setup fails.
   */
  confirm(message: string, options?: ConfirmOptions): InteractiveToastHandle<boolean>;

  /**
   * Displays a prompt input dialog requesting user text input.
   *
   * @param message Label description for the text input.
   * @param options Prefilled default value, placeholder text, and cancel behavior options.
   * @returns An interactive handle containing the input value promise.
   * @throws {Error} If the instance is destroyed, the message is empty, or no DOM is available.
   * The handle result rejects if native dialog setup fails.
   */
  prompt(message: string, options?: PromptOptions): InteractiveToastHandle<string | null>;

  /**
   * Displays a blocking informational alert modal dialog.
   *
   * @param message The alert warning or notification statement.
   * @param options Custom OK button labels and backdrop click closing options.
   * @returns An interactive handle containing the acknowledgement promise.
   * @throws {Error} If the instance is destroyed, the message is empty, or no DOM is available.
   * The handle result rejects if native dialog setup fails.
   */
  alert(message: string, options?: AlertOptions): InteractiveToastHandle<void>;
}

export function createInteractiveDispatcher(ctx: InteractiveContext): InteractiveDispatcher {
  return {
    confirm: (msg, opts) => {
      ctx.assertAlive();
      return ctx.getModalController().confirm(msg, opts);
    },
    prompt: (msg, opts) => {
      ctx.assertAlive();
      return ctx.getModalController().prompt(msg, opts);
    },
    alert: (msg, opts) => {
      ctx.assertAlive();
      return ctx.getModalController().alert(msg, opts);
    },
  };
}
