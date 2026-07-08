import { TOAST_SHAPE_CLASS } from "../options";
import type { ResolvedToastConfig } from "../options";
import { Toast } from "../toast-base";
import type { SemanticType, ToastIcon, ToastPosition, ToastRole, ToastTokens } from "../types";

interface SemanticRawOptions {
  type?: SemanticType;
  message: string;
  position?: ToastPosition;
  duration?: number;
  isDismissable?: boolean;
  shouldAutoDismiss?: boolean;
  tokens?: ToastTokens;
  className?: string;
  role?: ToastRole;
}

const SEMANTIC_ROOT_CLASS_NAMES: Record<SemanticType, string> = {
  success: `${TOAST_SHAPE_CLASS} min-w-40 p-3 gap-2 toast-success`,
  error: `${TOAST_SHAPE_CLASS} min-w-40 p-3 gap-2 toast-error`,
  warning: `${TOAST_SHAPE_CLASS} min-w-40 p-3 gap-2 toast-warning`,
  info: `${TOAST_SHAPE_CLASS} min-w-40 p-3 gap-2 toast-info`,
};

const SEMANTIC_ICONS: Record<SemanticType, ToastIcon> = {
  success: "success",
  error: "error",
  warning: "warning",
  info: "info",
};

const SEMANTIC_ROLES: Record<SemanticType, "alert" | "status"> = {
  success: "status",
  error: "alert",
  warning: "alert",
  info: "status",
};

/**
 * Toast variant for semantic notifications (success, error, warning, info)
 * with preconfigured icons and accessibility roles.
 */
export class SemanticToast extends Toast {
  protected static override getPresetOptions(options: SemanticRawOptions) {
    const type: SemanticType = options.type ?? "success";
    return {
      icon: SEMANTIC_ICONS[type],
      role: SEMANTIC_ROLES[type],
      rootClassName: SEMANTIC_ROOT_CLASS_NAMES[type],
    } as const;
  }

  /**
   * Constructs a new SemanticToast instance.
   *
   * @param params Parameter object containing options, config, and parent.
   */
  public constructor(params: { options: SemanticRawOptions; config: ResolvedToastConfig; parent: HTMLElement }) {
    super(params);
  }
}
