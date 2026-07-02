import { Toast } from "../toast-base";
import type { ToastOptions } from "../types";

type WithoutLoadingPreset<T> = T extends unknown ? Omit<T, "icon" | "role"> : never;
type LoadingToastOptions = WithoutLoadingPreset<ToastOptions>;

const LOADING_TOAST_ROOT_CLASS_NAME =
  "rounded-xl border-2 text-sm font-medium font-default pointer-events-auto flex items-center min-w-44 p-3 gap-2 toast-default";

export class LoadingToast extends Toast {
  protected static override getPresetOptions() {
    return {
      defaultAutoDismiss: false,
      icon: "loader",
      role: "status",
      rootClassName: LOADING_TOAST_ROOT_CLASS_NAME,
    } as const;
  }

  public constructor(options: LoadingToastOptions) {
    super(options);
  }
}
