import type { ModalManager } from "../modal";
import type { AlertOptions, ConfirmOptions, InteractiveToastHandle, PromptOptions } from "../types";

export interface InteractiveContext {
  assertAlive(): void;
  getModalManager(): ModalManager;
}

/**
 * Manager interface for displaying interactive browser-native modal dialogs.
 */
export interface InteractiveManager {
  /**
   * Displays a confirmation modal dialog with confirm and cancel buttons.
   *
   * @param message The confirmation message or question text.
   * @param options Configuration options for labels and backdrop behavior.
   * @returns An interactive handle containing the user decision promise.
   */
  confirm(message: string, options?: ConfirmOptions): InteractiveToastHandle<boolean>;

  /**
   * Displays a prompt input dialog requesting user text input.
   *
   * @param message Label description for the text input.
   * @param options Prefilled default value, placeholder text, and cancel behavior options.
   * @returns An interactive handle containing the input value promise.
   */
  prompt(message: string, options?: PromptOptions): InteractiveToastHandle<string | null>;

  /**
   * Displays a blocking informational alert modal dialog.
   *
   * @param message The alert warning or notification statement.
   * @param options Custom OK button labels and backdrop click closing options.
   * @returns An interactive handle containing the acknowledgement promise.
   */
  alert(message: string, options?: AlertOptions): InteractiveToastHandle<void>;
}

export function createInteractiveManager(ctx: InteractiveContext): InteractiveManager {
  return {
    confirm: (msg, opts) => {
      ctx.assertAlive();
      return ctx.getModalManager().confirm(msg, opts);
    },
    prompt: (msg, opts) => {
      ctx.assertAlive();
      return ctx.getModalManager().prompt(msg, opts);
    },
    alert: (msg, opts) => {
      ctx.assertAlive();
      return ctx.getModalManager().alert(msg, opts);
    },
  };
}
