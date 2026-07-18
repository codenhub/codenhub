import { Toast } from "../../core";
import type { ToastOptions } from "../../types";

type WithoutLoadingPreset<T> = T extends unknown ? Omit<T, "icon" | "role"> : never;
type LoadingToastOptions = WithoutLoadingPreset<ToastOptions>;

const LOADING_TOAST_ROOT_CLASS_NAME =
  "rounded-xl border-2 border-border text-sm font-medium font-default pointer-events-auto flex items-center min-w-44 p-3 gap-2 bg-surface text-text";

/** Indefinite status toast with a loader marker and automatic dismissal disabled by default. */
export class LoadingToast extends Toast {
  protected static getPresetOptions() {
    return {
      defaultAutoDismiss: false,
      icon: "loader",
      role: "status",
      rootClassName: LOADING_TOAST_ROOT_CLASS_NAME,
    } as const;
  }

  /**
   * Creates a loading toast while reserving its status role and loader icon.
   *
   * @throws When content or duration fails base toast validation.
   */
  public constructor(options: LoadingToastOptions) {
    super(options);
  }
}
