import { TOAST_SHAPE_CLASS } from "../options";
import type { ResolvedToastConfig } from "../options";
import { Toast } from "../toast-base";
import type { LoadingToastOptions } from "../types";

const LOADING_ROOT_CLASS = `${TOAST_SHAPE_CLASS} min-w-44 p-3 gap-2 toast-default`;

export class LoadingToast extends Toast {
  protected static override getPresetOptions() {
    return {
      defaultAutoDismiss: false,
      icon: "loader",
      role: "status",
      rootClassName: LOADING_ROOT_CLASS,
    } as const;
  }

  public constructor(options: LoadingToastOptions, config: ResolvedToastConfig, parent: HTMLElement) {
    super(options, config, parent);
  }
}
