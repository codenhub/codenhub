/**
 * Accessible browser toasts, from the ready-made `toast` singleton or instances made with `createToaster`. Dialogs live in `@codenhub/toaster/dialog`.
 *
 * @packageDocumentation
 */

export { createToaster, toast } from "./core";

export type {
  CustomDefaults,
  CustomToastOptions,
  LoadingDefaults,
  LoadingToastOptions,
  PromiseToastOptions,
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
  ToastUpdateOptions,
} from "./types";
