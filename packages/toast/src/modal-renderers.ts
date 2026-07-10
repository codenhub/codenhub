import { ACTIONS_CLASS, createHTMLElement } from "./modal-templates";
import type { AlertOptions, ConfirmOptions, PromptOptions } from "./types";

export interface ModalRenderContext<T> {
  container: HTMLDivElement;
  documentRef: Document;
  signal: AbortSignal;
  messageId: string;
  close(value: T): void;
}

export interface ModalRenderResult {
  initialFocus: HTMLElement;
  shouldDeferFocus?: boolean;
}

export function createConfirmRenderer(
  options: ConfirmOptions,
): (context: ModalRenderContext<boolean>) => ModalRenderResult {
  return ({ container, documentRef, signal, close }) => {
    const cancelButton = createHTMLElement("button", "toast-dialog-btn toast-dialog-btn-cancel", documentRef);
    cancelButton.type = "button";
    cancelButton.textContent = options.cancelLabel ?? "Cancel";
    cancelButton.addEventListener("click", () => close(false), { signal });

    const confirmButton = createHTMLElement(
      "button",
      `toast-dialog-btn toast-dialog-btn-${options.type ?? "primary"}`,
      documentRef,
    );
    confirmButton.type = "button";
    confirmButton.textContent = options.confirmLabel ?? "Confirm";
    confirmButton.addEventListener("click", () => close(true), { signal });

    const actions = createHTMLElement("div", ACTIONS_CLASS, documentRef);
    actions.append(cancelButton, confirmButton);
    container.appendChild(actions);
    return { initialFocus: options.type === "danger" ? cancelButton : confirmButton };
  };
}

export function createPromptRenderer(
  options: PromptOptions,
): (context: ModalRenderContext<string | null>) => ModalRenderResult {
  return ({ container, documentRef, signal, messageId, close }) => {
    const input = createHTMLElement("input", "toast-dialog-input", documentRef);
    input.type = "text";
    input.value = options.defaultValue ?? "";
    input.placeholder = options.placeholder ?? "";
    input.setAttribute("aria-labelledby", messageId);
    input.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Enter" && !event.isComposing && event.keyCode !== 229) {
          close(input.value);
        }
      },
      { signal },
    );
    container.appendChild(input);

    const cancelButton = createHTMLElement("button", "toast-dialog-btn toast-dialog-btn-cancel", documentRef);
    cancelButton.type = "button";
    cancelButton.textContent = options.cancelLabel ?? "Cancel";
    cancelButton.addEventListener("click", () => close(null), { signal });

    const submitButton = createHTMLElement(
      "button",
      `toast-dialog-btn toast-dialog-btn-${options.type ?? "primary"}`,
      documentRef,
    );
    submitButton.type = "button";
    submitButton.textContent = options.submitLabel ?? "Submit";
    submitButton.addEventListener("click", () => close(input.value), { signal });

    const actions = createHTMLElement("div", ACTIONS_CLASS, documentRef);
    actions.append(cancelButton, submitButton);
    container.appendChild(actions);
    return { initialFocus: input, shouldDeferFocus: true };
  };
}

export function createAlertRenderer(options: AlertOptions): (context: ModalRenderContext<void>) => ModalRenderResult {
  return ({ container, documentRef, signal, close }) => {
    const button = createHTMLElement(
      "button",
      `toast-dialog-btn toast-dialog-btn-${options.type ?? "primary"}`,
      documentRef,
    );
    button.type = "button";
    button.textContent = options.okLabel ?? "OK";
    button.addEventListener("click", () => close(undefined), { signal });
    const actions = createHTMLElement("div", ACTIONS_CLASS, documentRef);
    actions.appendChild(button);
    container.appendChild(actions);
    return { initialFocus: button };
  };
}
