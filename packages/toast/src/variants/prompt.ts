import { Toast } from "../toast-base";
import type { PromptToastOptions } from "../types";

export class PromptToast extends Toast {
  public readonly promise: Promise<string | null>;

  constructor(message: string, defaultValue = "", options?: PromptToastOptions) {
    let resolveFn: (value: string | null) => void;
    const promise = new Promise<string | null>((resolve) => {
      resolveFn = resolve;
    });

    const container = document.createElement("div");
    container.className = "flex flex-col gap-2 w-full";

    const text = document.createElement("p");
    text.textContent = message;
    container.appendChild(text);

    const input = document.createElement("input");
    input.type = "text";
    input.value = defaultValue;
    input.placeholder = options?.placeholder ?? "";
    input.className = "input sm w-full border border-border rounded p-1 bg-background text-text";
    container.appendChild(input);

    const actions = document.createElement("div");
    actions.className = "flex justify-end gap-2 mt-1";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = options?.cancelLabel ?? "Cancel";
    cancelButton.className = "btn secondary sm";
    cancelButton.addEventListener("click", () => {
      resolveFn(null);
      this.hide();
    });

    const submitButton = document.createElement("button");
    submitButton.type = "button";
    submitButton.textContent = options?.submitLabel ?? "Submit";
    submitButton.className = "btn primary sm";
    submitButton.addEventListener("click", () => {
      resolveFn(input.value);
      this.hide();
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        resolveFn(input.value);
        this.hide();
      }
    });

    actions.appendChild(cancelButton);
    actions.appendChild(submitButton);
    container.appendChild(actions);

    super({
      ...options,
      content: container,
      autoDismiss: false,
      isDismissable: false,
    });

    this.promise = promise;
    this.onShown(() => {
      input.focus();
    });
    this.onHidden(() => {
      resolveFn(null);
    });
  }
}
