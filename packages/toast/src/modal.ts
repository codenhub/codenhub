import { buildInlineStyle } from "./tokens";
import type {
  AlertOptions,
  ConfirmOptions,
  InteractiveToastHandle,
  PromptOptions,
  ToastState,
  ToastTokens,
} from "./types";

// ---------------------------------------------------------------------------
// Native <dialog>-based blocking modal
//
// Interactive toasts use a completely separate render path from the toast
// stack. A single <dialog> element is created per toaster instance and reused
// across calls via a FIFO queue so multiple concurrent calls serialize.
// ---------------------------------------------------------------------------

const DIALOG_CLASS =
  "relative m-0 rounded-xl border-2 border-border bg-surface p-5 text-text shadow-2xl w-full max-w-sm pointer-events-auto";
const MESSAGE_CLASS = "text-sm font-medium mb-4 leading-relaxed";
const ACTIONS_CLASS = "flex justify-end gap-2";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  return node;
}

// ---------------------------------------------------------------------------

interface ModalJob {
  run: () => void;
}

export class ModalManager {
  private dialog: HTMLDialogElement | null = null;
  private queue: ModalJob[] = [];
  private isRunning = false;
  private destroyed = false;

  constructor(private readonly parent: HTMLElement) {}

  // --- Public factory methods -----------------------------------------------

  public confirm(message: string, options: ConfirmOptions = {}): InteractiveToastHandle<boolean> {
    let resolve!: (value: boolean) => void;
    const result = new Promise<boolean>((res) => (resolve = res));
    let settleFn!: () => void;
    const settled = new Promise<void>((res) => (settleFn = res));
    let currentState: ToastState = "visible";

    const dismiss = (): void => {
      resolve(false);
    };

    this.enqueue({
      run: () => {
        const dialog = this.ensureDialog();
        const container = this.buildDialogContent(dialog, message, options.tokens, options.className);

        const cancelBtn = el("button");
        cancelBtn.type = "button";
        cancelBtn.textContent = options.cancelLabel ?? "Cancel";
        cancelBtn.className = "btn secondary sm";

        const confirmBtn = el("button");
        confirmBtn.type = "button";
        confirmBtn.textContent = options.confirmLabel ?? "Confirm";
        confirmBtn.className = "btn primary sm";

        const actions = el("div", ACTIONS_CLASS);
        actions.appendChild(cancelBtn);
        actions.appendChild(confirmBtn);
        container.appendChild(actions);

        const close = (value: boolean): void => {
          resolve(value);
          this.closeDialog(dialog, () => {
            currentState = "hidden";
            settleFn();
            this.next();
          });
        };

        cancelBtn.addEventListener("click", () => close(false));
        confirmBtn.addEventListener("click", () => close(true));

        const onCancel = (e: Event): void => {
          e.preventDefault();
          close(false);
        };
        dialog.addEventListener("cancel", onCancel, { once: true });

        if (options.backdropDismiss === true) {
          const onBackdropClick = (e: MouseEvent): void => {
            if (e.target === dialog) {
              close(false);
            }
          };
          dialog.addEventListener("click", onBackdropClick, { once: true });
        }

        dialog.showModal();
        confirmBtn.focus();
      },
    });

    return {
      dismiss,
      update: () => {
        /* no-op for modals */
      },
      get settled() {
        return settled;
      },
      get state() {
        return currentState;
      },
      result,
    };
  }

  public prompt(message: string, options: PromptOptions = {}): InteractiveToastHandle<string | null> {
    let resolve!: (value: string | null) => void;
    const result = new Promise<string | null>((res) => (resolve = res));
    let settleFn!: () => void;
    const settled = new Promise<void>((res) => (settleFn = res));
    let currentState: ToastState = "visible";

    const dismiss = (): void => {
      resolve(null);
    };

    this.enqueue({
      run: () => {
        const dialog = this.ensureDialog();
        const container = this.buildDialogContent(dialog, message, options.tokens, options.className);

        const input = el("input");
        input.type = "text";
        input.value = options.defaultValue ?? "";
        input.placeholder = options.placeholder ?? "";
        input.className = "input sm w-full border border-border rounded p-2 bg-background text-text text-sm mt-1 mb-3";
        container.appendChild(input);

        const cancelBtn = el("button");
        cancelBtn.type = "button";
        cancelBtn.textContent = options.cancelLabel ?? "Cancel";
        cancelBtn.className = "btn secondary sm";

        const submitBtn = el("button");
        submitBtn.type = "button";
        submitBtn.textContent = options.submitLabel ?? "Submit";
        submitBtn.className = "btn primary sm";

        const actions = el("div", ACTIONS_CLASS);
        actions.appendChild(cancelBtn);
        actions.appendChild(submitBtn);
        container.appendChild(actions);

        const close = (value: string | null): void => {
          resolve(value);
          this.closeDialog(dialog, () => {
            currentState = "hidden";
            settleFn();
            this.next();
          });
        };

        cancelBtn.addEventListener("click", () => close(null));
        submitBtn.addEventListener("click", () => close(input.value));
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            close(input.value);
          }
        });

        const onCancel = (e: Event): void => {
          e.preventDefault();
          close(null);
        };
        dialog.addEventListener("cancel", onCancel, { once: true });

        if (options.backdropDismiss === true) {
          const onBackdropClick = (e: MouseEvent): void => {
            if (e.target === dialog) {
              close(null);
            }
          };
          dialog.addEventListener("click", onBackdropClick, { once: true });
        }

        dialog.showModal();
        // Autofocus input after paint so animation doesn't glitch
        requestAnimationFrame(() => input.focus());
      },
    });

    return {
      dismiss,
      update: () => {
        /* no-op for modals */
      },
      get settled() {
        return settled;
      },
      get state() {
        return currentState;
      },
      result,
    };
  }

  public alert(message: string, options: AlertOptions = {}): InteractiveToastHandle<void> {
    let resolve!: () => void;
    const result = new Promise<void>((res) => (resolve = res));
    let settleFn!: () => void;
    const settled = new Promise<void>((res) => (settleFn = res));
    let currentState: ToastState = "visible";

    const dismiss = (): void => {
      resolve();
    };

    this.enqueue({
      run: () => {
        const dialog = this.ensureDialog();
        const container = this.buildDialogContent(dialog, message, options.tokens, options.className);

        const okBtn = el("button");
        okBtn.type = "button";
        okBtn.textContent = options.okLabel ?? "OK";
        okBtn.className = "btn primary sm";

        const actions = el("div", ACTIONS_CLASS);
        actions.appendChild(okBtn);
        container.appendChild(actions);

        const close = (): void => {
          resolve();
          this.closeDialog(dialog, () => {
            currentState = "hidden";
            settleFn();
            this.next();
          });
        };

        okBtn.addEventListener("click", close);

        const onCancel = (e: Event): void => {
          e.preventDefault();
          close();
        };
        dialog.addEventListener("cancel", onCancel, { once: true });

        const backdropDismiss = options.backdropDismiss !== false;
        if (backdropDismiss) {
          const onBackdropClick = (e: MouseEvent): void => {
            if (e.target === dialog) {
              close();
            }
          };
          dialog.addEventListener("click", onBackdropClick, { once: true });
        }

        dialog.showModal();
        okBtn.focus();
      },
    });

    return {
      dismiss,
      update: () => {
        /* no-op for modals */
      },
      get settled() {
        return settled;
      },
      get state() {
        return currentState;
      },
      result,
    };
  }

  // --- Cleanup ---------------------------------------------------------------

  public destroy(): void {
    this.destroyed = true;
    this.queue = [];
    if (this.dialog) {
      if (this.dialog.open) {
        this.dialog.close();
      }
      this.dialog.remove();
      this.dialog = null;
    }
  }

  // --- Internals -------------------------------------------------------------

  private enqueue(job: ModalJob): void {
    if (this.destroyed) {
      return;
    }
    this.queue.push(job);
    if (!this.isRunning) {
      this.next();
    }
  }

  private next(): void {
    if (this.destroyed || this.queue.length === 0) {
      this.isRunning = false;
      return;
    }
    this.isRunning = true;
    const job = this.queue.shift()!;
    job.run();
  }

  private ensureDialog(): HTMLDialogElement {
    if (!this.dialog) {
      const dialog = document.createElement("dialog");
      // Use CSS class for backdrop; native ::backdrop handled in styles
      dialog.className = DIALOG_CLASS;
      // Wrap in a flex backdrop container so we get the overlay effect
      // via the native ::backdrop pseudo-element (styled via CSS)
      this.parent.appendChild(dialog);
      this.dialog = dialog;
    } else {
      // Clear previous content
      this.dialog.innerHTML = "";
    }
    return this.dialog;
  }

  private buildDialogContent(
    dialog: HTMLDialogElement,
    message: string,
    tokens?: ToastTokens,
    className?: string,
  ): HTMLDivElement {
    if (className) {
      dialog.className = `${DIALOG_CLASS} ${className}`;
    } else {
      dialog.className = DIALOG_CLASS;
    }

    if (tokens) {
      const inlineStyle = buildInlineStyle(tokens);
      if (inlineStyle) {
        dialog.style.cssText = inlineStyle;
      }
    } else {
      dialog.style.cssText = "";
    }

    const content = el("div");
    const p = el("p", MESSAGE_CLASS);
    p.textContent = message;
    content.appendChild(p);
    dialog.appendChild(content);
    return content;
  }

  private closeDialog(dialog: HTMLDialogElement, onClosed: () => void): void {
    if (!dialog.open) {
      onClosed();
      return;
    }
    dialog.close();
    onClosed();
  }
}
