import { TOAST_SHAPE_CLASS } from "../options";
import type { ResolvedToastConfig } from "../options";
import { Toast } from "../toast-base";
import type { LoadingToastOptions } from "../types";

const LOADING_ROOT_CLASS = `${TOAST_SHAPE_CLASS} min-w-44 p-3 gap-2 toast-default`;

/**
 * Toast variant for progress/loading status alerts.
 * By default, loading toasts are not auto-dismissed.
 */
export class LoadingToast extends Toast {
  protected static override getPresetOptions() {
    return {
      shouldAutoDismiss: false,
      icon: "loader",
      role: "status",
      rootClassName: LOADING_ROOT_CLASS,
    } as const;
  }

  /**
   * Constructs a new LoadingToast instance.
   *
   * @param options Raw user-provided loading notification options.
   * @param config The resolved configuration of the parent toaster.
   * @param parent The DOM container element where the stack container lives.
   */
  public constructor(options: LoadingToastOptions, config: ResolvedToastConfig, parent: HTMLElement) {
    super(options, config, parent);
  }
}
