/**
 * Accessible browser toasts and native dialogs, from ready-made `toast` and `dialog` singletons or instances made with `createToaster`.
 *
 * @packageDocumentation
 */

export { createToaster, toast, dialog } from "./core";

export type {
  AlertOptions,
  ConfirmOptions,
  CustomDefaults,
  CustomToastOptions,
  DialogDispatcher,
  DialogHandle,
  LoadingDefaults,
  LoadingToastOptions,
  PromiseToastOptions,
  PromptOptions,
  SemanticDefaults,
  SemanticToastOptions,
  SemanticType,
  ToastAction,
  ToastContent,
  Toaster,
  ToasterConfig,
  ToastHandle,
  ToastIcon,
  ToastLabels,
  ToastLifecycleSubscriber,
  ToastOptions,
  ToastPosition,
  ToastRole,
  ToasterRuntimeConfig,
  ToastState,
  ToastTokens,
  ToastUpdateOptions,
} from "./types";
