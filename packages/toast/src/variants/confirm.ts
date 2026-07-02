import { Toast } from "../toast-base";
import type { ConfirmToastOptions } from "../types";

export class ConfirmToast extends Toast {
  public readonly promise: Promise<boolean>;

  constructor(message: string, options?: ConfirmToastOptions) {
    let resolveFn: (value: boolean) => void;
    const promise = new Promise<boolean>((resolve) => {
      resolveFn = resolve;
    });

    const container = document.createElement("div");
    container.className = "flex flex-col gap-2 w-full";

    const text = document.createElement("p");
    text.textContent = message;
    container.appendChild(text);

    const actions = document.createElement("div");
    actions.className = "flex justify-end gap-2 mt-1";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = options?.cancelLabel ?? "Cancel";
    cancelButton.className = "btn secondary sm";
    cancelButton.addEventListener("click", () => {
      resolveFn(false);
      this.hide();
    });

    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.textContent = options?.confirmLabel ?? "Confirm";
    confirmButton.className = "btn primary sm";
    confirmButton.addEventListener("click", () => {
      resolveFn(true);
      this.hide();
    });

    actions.appendChild(cancelButton);
    actions.appendChild(confirmButton);
    container.appendChild(actions);

    super({
      ...options,
      content: container,
      autoDismiss: false,
      isDismissable: false,
    });

    this.promise = promise;
    this.onHidden(() => {
      resolveFn(false);
    });
  }
}
