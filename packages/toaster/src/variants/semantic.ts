import { SEMANTIC_ICONS, SEMANTIC_ROLES, SEMANTIC_ROOT_CLASS_NAMES, assertSemanticType } from "../options";
import type { ResolvedToastConfig } from "../options";
import { Toast } from "../toast-base";
import type { SemanticToastOptions, SemanticType } from "../types";

/**
 * Configuration options passed when constructing a SemanticToast instance.
 */
export interface SemanticRawOptions extends SemanticToastOptions {
  /** The semantic category type. Defaults to "success". */
  type?: SemanticType | "default";
}

/**
 * Toast variant for semantic notifications (success, error, warning, info)
 * with preconfigured icons and accessibility roles.
 */
export class SemanticToast extends Toast {
  protected static override getPresetOptions(options: SemanticRawOptions) {
    const type: SemanticType | "default" = options.type ?? "success";
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
