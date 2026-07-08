import type { ModalManager } from "../modal";
import type { AlertOptions, ConfirmOptions, InteractiveToastHandle, PromptOptions } from "../types";

export interface InteractiveContext {
  assertAlive(): void;
  modalManager: ModalManager;
}

export interface InteractiveManager {
  confirm(message: string, options?: ConfirmOptions): InteractiveToastHandle<boolean>;
  prompt(message: string, options?: PromptOptions): InteractiveToastHandle<string | null>;
  alert(message: string, options?: AlertOptions): InteractiveToastHandle<void>;
}

export function createInteractiveManager(ctx: InteractiveContext): InteractiveManager {
  return {
    confirm: (msg, opts) => {
      ctx.assertAlive();
      return ctx.modalManager.confirm(msg, opts);
    },
    prompt: (msg, opts) => {
      ctx.assertAlive();
      return ctx.modalManager.prompt(msg, opts);
    },
    alert: (msg, opts) => {
      ctx.assertAlive();
      return ctx.modalManager.alert(msg, opts);
    },
  };
}
