/**
 * Accessible native modal dialogs, from the ready-made `dialog` singleton or instances made with `createDialogs`. Kept apart from `@codenhub/toaster` so an app that only shows toasts does not bundle them.
 *
 * @packageDocumentation
 */

export { createDialogs, dialog } from "./dialogs";

export type {
  AlertOptions,
  ConfirmOptions,
  DialogHandle,
  DialogLabels,
  Dialogs,
  DialogsConfig,
  DialogsRuntimeConfig,
  PromptOptions,
} from "./types";
