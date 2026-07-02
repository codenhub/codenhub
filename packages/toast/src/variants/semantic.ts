import { Toast } from "../toast-base";
import type { ToastIcon, ToastOptions } from "../types";

type SemanticToastType = "success" | "error" | "warning" | "info";
type WithoutSemanticPreset<T> = T extends unknown ? Omit<T, "icon" | "role"> : never;
type SemanticToastOptions = WithoutSemanticPreset<ToastOptions> & {
  type?: SemanticToastType;
};

const DEFAULT_SEMANTIC_TYPE: SemanticToastType = "success";
const TOAST_SHAPE_CLASS_NAME =
  "rounded-xl border-2 text-sm font-medium font-default pointer-events-auto flex items-center min-w-40 p-3 gap-2";

const SEMANTIC_ROOT_CLASS_NAMES: Record<SemanticToastType, string> = {
  success: `${TOAST_SHAPE_CLASS_NAME} toast-success`,
  error: `${TOAST_SHAPE_CLASS_NAME} toast-error`,
  warning: `${TOAST_SHAPE_CLASS_NAME} toast-warning`,
  info: `${TOAST_SHAPE_CLASS_NAME} toast-info`,
};

const SEMANTIC_ICONS: Record<SemanticToastType, ToastIcon> = {
  success: "success",
  error: "error",
  warning: "warning",
  info: "info",
};

const SEMANTIC_ROLES: Record<SemanticToastType, "alert" | "status"> = {
  success: "status",
  error: "alert",
  warning: "alert",
  info: "status",
};

function getSemanticToastPreset(type: SemanticToastType) {
  return {
    icon: SEMANTIC_ICONS[type],
    role: SEMANTIC_ROLES[type],
    rootClassName: SEMANTIC_ROOT_CLASS_NAMES[type],
  } as const;
}

export class SemanticToast extends Toast {
  protected static override getPresetOptions(options: SemanticToastOptions) {
    return getSemanticToastPreset(options.type ?? DEFAULT_SEMANTIC_TYPE);
  }

  public constructor(options: SemanticToastOptions) {
    super(options);
  }
}
