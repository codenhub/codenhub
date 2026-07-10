import { TOAST_SHAPE_CLASS } from "../options";
import type { ResolvedToastConfig } from "../options";
import { Toast } from "../toast-base";
import type { SemanticToastOptions, SemanticType, ToastIcon } from "../types";

/**
 * Configuration options passed when constructing a SemanticToast instance.
 */
export interface SemanticRawOptions extends SemanticToastOptions {
  /** The semantic category type. Defaults to "success". */
  type?: SemanticType;
}

const SEMANTIC_ROOT_CLASS_NAMES: Record<SemanticType, string> = {
  success: `${TOAST_SHAPE_CLASS} coden-toast-success`,
  error: `${TOAST_SHAPE_CLASS} coden-toast-error`,
  warning: `${TOAST_SHAPE_CLASS} coden-toast-warning`,
  info: `${TOAST_SHAPE_CLASS} coden-toast-info`,
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

function assertSemanticType(value: unknown): asserts value is SemanticType {
  if (!Object.hasOwn(SEMANTIC_ROLES, value as PropertyKey)) {
    throw new Error(`Invalid semantic toast type: ${String(value)}`);
  }
}

/**
 * Toast variant for semantic notifications (success, error, warning, info)
 * with preconfigured icons and accessibility roles.
 */
export class SemanticToast extends Toast {
  protected static override getPresetOptions(options: SemanticRawOptions) {
    const type: SemanticType = options.type ?? "success";
    assertSemanticType(type);
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
