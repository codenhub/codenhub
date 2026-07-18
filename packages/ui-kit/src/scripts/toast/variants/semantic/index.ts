import { Toast } from "../../core";
import type { ToastIcon, ToastOptions } from "../../types";

type SemanticToastType = "success" | "error" | "warning" | "info";
type WithoutSemanticPreset<T> = T extends unknown ? Omit<T, "icon" | "role"> : never;
type SemanticToastOptions = WithoutSemanticPreset<ToastOptions> & {
  /** Semantic intent controlling root colors, marker icon, and live-region role. Defaults to success. */
  type?: SemanticToastType;
};

const DEFAULT_SEMANTIC_TYPE: SemanticToastType = "success";
const TOAST_SHAPE_CLASS_NAME =
  "rounded-xl border-2 text-sm font-medium font-default pointer-events-auto flex items-center min-w-40 p-3 gap-2";

const SEMANTIC_ROOT_CLASS_NAMES: Record<SemanticToastType, string> = {
  success: `${TOAST_SHAPE_CLASS_NAME} border-success bg-success-light text-success-dark`,
  error: `${TOAST_SHAPE_CLASS_NAME} border-destructive bg-destructive-light text-destructive-dark`,
  warning: `${TOAST_SHAPE_CLASS_NAME} border-warning bg-warning-light text-warning-dark`,
  info: `${TOAST_SHAPE_CLASS_NAME} border-info bg-info-light text-info-dark`,
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

/** Intent toast that presets accessible urgency, marker icon, and color classes. */
export class SemanticToast extends Toast {
  protected static getPresetOptions(options: SemanticToastOptions) {
    return getSemanticToastPreset(options.type ?? DEFAULT_SEMANTIC_TYPE);
  }

  /**
   * Creates a semantic toast while reserving role and icon selection for its intent.
   *
   * @throws When content or duration fails base toast validation.
   */
  public constructor(options: SemanticToastOptions) {
    super(options);
  }
}
