import { Toast } from "../toast-base";
import type { AlertToastOptions } from "../types";

export class AlertToast extends Toast {
  public readonly promise: Promise<void>;

  constructor(message: string, options?: AlertToastOptions) {
    let resolveFn: () => void;
    const promise = new Promise<void>((resolve) => {
      resolveFn = resolve;
    });

    const container = document.createElement("div");
    container.className = "flex flex-col gap-2 w-full";

    const text = document.createElement("p");
    text.textContent = message;
    container.appendChild(text);

    const actions = document.createElement("div");
    actions.className = "flex justify-end mt-1";

    const okButton = document.createElement("button");
    okButton.type = "button";
    okButton.textContent = options?.okLabel ?? "OK";
    okButton.className = "btn primary sm";
    okButton.addEventListener("click", () => {
      resolveFn();
      this.hide();
    });

    actions.appendChild(okButton);
    container.appendChild(actions);

    super({
      ...options,
      content: container,
      autoDismiss: false,
      isDismissable: false,
    });

    this.promise = promise;
    this.onHidden(() => {
      resolveFn();
    });
  }
}
