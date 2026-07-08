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
  dismiss: () => void;
}

interface BuildDialogContentParams {
  dialog: HTMLDialogElement;
  message: string;
  tokens?: ToastTokens;
  className?: string;
}

/**
 * Manages native dialog modals for interactive alerts, confirmations, and prompts.
 * Leverages a queue to serialize multiple modal dialogs.
 */
export class ModalManager {
  private dialog: HTMLDialogElement | null = null;
  private queue: ModalJob[] = [];
  private activeJob: ModalJob | null = null;
  private isRunning = false;
  private isDestroyed = false;

  /**
   * Constructs a new ModalManager instance.
   *
   * @param parent The parent DOM container.
   * @param instanceId The unique toaster instance ID for CSS variable scoping.
   */
  constructor(
    private readonly parent: HTMLElement,
    private readonly instanceId: string,
  ) {}

  // --- Public factory methods -----------------------------------------------

  /**
   * Enqueues and displays a confirmation dialog.
   *
   * @param message Question or statement to confirm.
   * @param options Confirm action configurations.
   */
  public confirm(message: string, options: ConfirmOptions = {}): InteractiveToastHandle<boolean> {
    let resolve!: (value: boolean) => void;
    const result = new Promise<boolean>((res) => (resolve = res));
    let settleFn!: () => void;
    const settled = new Promise<void>((res) => (settleFn = res));
    let currentState: ToastState = "visible";
    let isCanceled = false;
    let activeClose: ((value: boolean) => void) | null = null;

    const job: ModalJob = {
      run: () => {
        if (isCanceled) {
          this.next();
          return;
        }

        const dialog = this.ensureDialog();
        const container = this.buildDialogContent({
          dialog,
          message,
          tokens: options.tokens,
          className: options.className,
        });

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
          activeClose = null;
          resolve(value);
          this.closeDialog(dialog, () => {
            currentState = "hidden";
            settleFn();
            this.next();
          });
        };

        activeClose = close;

        cancelBtn.addEventListener("click", () => close(false));
        confirmBtn.addEventListener("click", () => close(true));

        const onCancel = (e: Event): void => {
          e.preventDefault();
          close(false);
        };
        dialog.addEventListener("cancel", onCancel, { once: true });

        if (options.shouldBackdropDismiss === true) {
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
      dismiss: () => {
        if (activeClose) {
          activeClose(false);
        } else {
          isCanceled = true;
          resolve(false);
          currentState = "hidden";
          settleFn();
        }
      },
    };

    this.enqueue(job);

    return {
      dismiss: () => job.dismiss(),
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

  /**
   * Enqueues and displays an input prompt dialog.
   *
   * @param message Label description for the input text field.
   * @param options Prompt configuration settings.
   */
  public prompt(message: string, options: PromptOptions = {}): InteractiveToastHandle<string | null> {
    let resolve!: (value: string | null) => void;
    const result = new Promise<string | null>((res) => (resolve = res));
    let settleFn!: () => void;
    const settled = new Promise<void>((res) => (settleFn = res));
    let currentState: ToastState = "visible";
    let isCanceled = false;
    let activeClose: ((value: string | null) => void) | null = null;

    const job: ModalJob = {
      run: () => {
        if (isCanceled) {
          this.next();
          return;
        }

        const dialog = this.ensureDialog();
        const container = this.buildDialogContent({
          dialog,
          message,
          tokens: options.tokens,
          className: options.className,
        });

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
          activeClose = null;
          resolve(value);
          this.closeDialog(dialog, () => {
            currentState = "hidden";
            settleFn();
            this.next();
          });
        };

        activeClose = close;

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

        if (options.shouldBackdropDismiss === true) {
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
      dismiss: () => {
        if (activeClose) {
          activeClose(null);
        } else {
          isCanceled = true;
          resolve(null);
          currentState = "hidden";
          settleFn();
        }
      },
    };

    this.enqueue(job);

    return {
      dismiss: () => job.dismiss(),
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

  /**
   * Enqueues and displays a blocking message alert dialog.
   *
   * @param message Informational statement text.
   * @param options Alert customization options.
   */
  public alert(message: string, options: AlertOptions = {}): InteractiveToastHandle<void> {
    let resolve!: () => void;
    const result = new Promise<void>((res) => (resolve = res));
    let settleFn!: () => void;
    const settled = new Promise<void>((res) => (settleFn = res));
    let currentState: ToastState = "visible";
    let isCanceled = false;
    let activeClose: (() => void) | null = null;

    const job: ModalJob = {
      run: () => {
        if (isCanceled) {
          this.next();
          return;
        }

        const dialog = this.ensureDialog();
        const container = this.buildDialogContent({
          dialog,
          message,
          tokens: options.tokens,
          className: options.className,
        });

        const okBtn = el("button");
        okBtn.type = "button";
        okBtn.textContent = options.okLabel ?? "OK";
        okBtn.className = "btn primary sm";

        const actions = el("div", ACTIONS_CLASS);
        actions.appendChild(okBtn);
        container.appendChild(actions);

        const close = (): void => {
          activeClose = null;
          resolve();
          this.closeDialog(dialog, () => {
            currentState = "hidden";
            settleFn();
            this.next();
          });
        };

        activeClose = close;

        okBtn.addEventListener("click", close);

        const onCancel = (e: Event): void => {
          e.preventDefault();
          close();
        };
        dialog.addEventListener("cancel", onCancel, { once: true });

        const shouldBackdropDismiss = options.shouldBackdropDismiss !== false;
        if (shouldBackdropDismiss) {
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
      dismiss: () => {
        if (activeClose) {
          activeClose();
        } else {
          isCanceled = true;
          resolve();
          currentState = "hidden";
          settleFn();
        }
      },
    };

    this.enqueue(job);

    return {
      dismiss: () => job.dismiss(),
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

  /**
   * Tear down the manager, resolving any pending queued modal promises,
   * closing the dialog, and removing elements from the DOM.
   */
  public destroy(): void {
    this.isDestroyed = true;
    const currentQueue = this.queue;
    this.queue = [];

    currentQueue.forEach((job) => job.dismiss());
    if (this.activeJob) {
      this.activeJob.dismiss();
      this.activeJob = null;
    }

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
    if (this.isDestroyed) {
      return;
    }
    this.queue.push(job);
    if (!this.isRunning) {
      this.next();
    }
  }

  private next(): void {
    if (this.isDestroyed || this.queue.length === 0) {
      this.isRunning = false;
      this.activeJob = null;
      return;
    }
    this.isRunning = true;
    this.activeJob = this.queue.shift()!;
    this.activeJob.run();
  }

  private ensureDialog(): HTMLDialogElement {
    if (!this.dialog) {
      const dialog = document.createElement("dialog");
      // Use CSS class for backdrop; native ::backdrop handled in styles
      dialog.className = DIALOG_CLASS;
      dialog.setAttribute("data-toast-instance", this.instanceId);
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

  private buildDialogContent(params: BuildDialogContentParams): HTMLDivElement {
    const { dialog, message, tokens, className } = params;

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
