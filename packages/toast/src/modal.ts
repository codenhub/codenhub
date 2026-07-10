import { ACTIONS_CLASS, DIALOG_CLASS, buildDialogContent, createHTMLElement } from "./modal-templates";
import type { AlertOptions, ConfirmOptions, InteractiveToastHandle, PromptOptions, ToastState } from "./types";

interface ModalJob {
  run: () => void;
  dismiss: () => void;
}

/**
 * Manages native dialog modals for interactive alerts, confirmations, and prompts.
 * Leverages a queue to serialize multiple modal dialogs.
 */
export class ModalManager {
  private dialog: HTMLDialogElement | null = null;
  private jobs: ModalJob[] = [];
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

    const abortController = new AbortController();
    const { signal } = abortController;

    const job: ModalJob = {
      run: () => {
        if (isCanceled) {
          this.next();
          return;
        }

        const dialog = this.ensureDialog();
        const container = buildDialogContent({
          dialog,
          message,
          tokens: options.tokens,
          className: options.className,
        });

        const cancelBtn = createHTMLElement("button");
        cancelBtn.type = "button";
        cancelBtn.textContent = options.cancelLabel ?? "Cancel";
        cancelBtn.className = "toast-dialog-btn toast-dialog-btn-cancel toast-dialog-btn-secondary";

        const confirmBtn = createHTMLElement("button");
        confirmBtn.type = "button";
        confirmBtn.textContent = options.confirmLabel ?? "Confirm";
        confirmBtn.className = `toast-dialog-btn toast-dialog-btn-${options.type ?? "primary"}`;

        const actions = createHTMLElement("div", ACTIONS_CLASS);
        actions.appendChild(cancelBtn);
        actions.appendChild(confirmBtn);
        container.appendChild(actions);

        const close = (value: boolean): void => {
          abortController.abort();
          activeClose = null;
          resolve(value);
          this.closeDialog(dialog, () => {
            currentState = "hidden";
            settleFn();
            this.next();
          });
        };

        activeClose = close;

        cancelBtn.addEventListener("click", () => close(false), { signal });
        confirmBtn.addEventListener("click", () => close(true), { signal });

        const onCancel = (e: Event): void => {
          e.preventDefault();
          close(false);
        };
        dialog.addEventListener("cancel", onCancel, { signal });

        if (options.shouldBackdropDismiss === true) {
          const onBackdropClick = (e: MouseEvent): void => {
            if (e.target === dialog) {
              const rect = dialog.getBoundingClientRect();
              const isInDialog =
                e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
              if (!isInDialog) {
                close(false);
              }
            }
          };
          dialog.addEventListener("click", onBackdropClick, { signal });
        }

        dialog.showModal();
        confirmBtn.focus();
      },
      dismiss: () => {
        if (activeClose) {
          activeClose(false);
        } else {
          isCanceled = true;
          abortController.abort();
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

    const abortController = new AbortController();
    const { signal } = abortController;

    const job: ModalJob = {
      run: () => {
        if (isCanceled) {
          this.next();
          return;
        }

        const dialog = this.ensureDialog();
        const container = buildDialogContent({
          dialog,
          message,
          tokens: options.tokens,
          className: options.className,
        });

        const input = createHTMLElement("input");
        input.type = "text";
        input.value = options.defaultValue ?? "";
        input.placeholder = options.placeholder ?? "";
        input.className = "toast-dialog-input";
        container.appendChild(input);

        const cancelBtn = createHTMLElement("button");
        cancelBtn.type = "button";
        cancelBtn.textContent = options.cancelLabel ?? "Cancel";
        cancelBtn.className = "toast-dialog-btn toast-dialog-btn-cancel toast-dialog-btn-secondary";

        const submitBtn = createHTMLElement("button");
        submitBtn.type = "button";
        submitBtn.textContent = options.submitLabel ?? "Submit";
        submitBtn.className = `toast-dialog-btn toast-dialog-btn-${options.type ?? "primary"}`;

        const actions = createHTMLElement("div", ACTIONS_CLASS);
        actions.appendChild(cancelBtn);
        actions.appendChild(submitBtn);
        container.appendChild(actions);

        const close = (value: string | null): void => {
          abortController.abort();
          activeClose = null;
          resolve(value);
          this.closeDialog(dialog, () => {
            currentState = "hidden";
            settleFn();
            this.next();
          });
        };

        activeClose = close;

        cancelBtn.addEventListener("click", () => close(null), { signal });
        submitBtn.addEventListener("click", () => close(input.value), { signal });
        input.addEventListener(
          "keydown",
          (e) => {
            if (e.key === "Enter") {
              close(input.value);
            }
          },
          { signal },
        );

        const onCancel = (e: Event): void => {
          e.preventDefault();
          close(null);
        };
        dialog.addEventListener("cancel", onCancel, { signal });

        if (options.shouldBackdropDismiss === true) {
          const onBackdropClick = (e: MouseEvent): void => {
            if (e.target === dialog) {
              const rect = dialog.getBoundingClientRect();
              const isInDialog =
                e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
              if (!isInDialog) {
                close(null);
              }
            }
          };
          dialog.addEventListener("click", onBackdropClick, { signal });
        }

        dialog.showModal();
        requestAnimationFrame(() => input.focus());
      },
      dismiss: () => {
        if (activeClose) {
          activeClose(null);
        } else {
          isCanceled = true;
          abortController.abort();
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

    const abortController = new AbortController();
    const { signal } = abortController;

    const job: ModalJob = {
      run: () => {
        if (isCanceled) {
          this.next();
          return;
        }

        const dialog = this.ensureDialog();
        const container = buildDialogContent({
          dialog,
          message,
          tokens: options.tokens,
          className: options.className,
        });

        const okBtn = createHTMLElement("button");
        okBtn.type = "button";
        okBtn.textContent = options.okLabel ?? "OK";
        okBtn.className = `toast-dialog-btn toast-dialog-btn-${options.type ?? "primary"}`;

        const actions = createHTMLElement("div", ACTIONS_CLASS);
        actions.appendChild(okBtn);
        container.appendChild(actions);

        const close = (): void => {
          abortController.abort();
          activeClose = null;
          resolve();
          this.closeDialog(dialog, () => {
            currentState = "hidden";
            settleFn();
            this.next();
          });
        };

        activeClose = close;

        okBtn.addEventListener("click", close, { signal });

        const onCancel = (e: Event): void => {
          e.preventDefault();
          close();
        };
        dialog.addEventListener("cancel", onCancel, { signal });

        const shouldBackdropDismiss = options.shouldBackdropDismiss !== false;
        if (shouldBackdropDismiss) {
          const onBackdropClick = (e: MouseEvent): void => {
            if (e.target === dialog) {
              const rect = dialog.getBoundingClientRect();
              const isInDialog =
                e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
              if (!isInDialog) {
                close();
              }
            }
          };
          dialog.addEventListener("click", onBackdropClick, { signal });
        }

        dialog.showModal();
        okBtn.focus();
      },
      dismiss: () => {
        if (activeClose) {
          activeClose();
        } else {
          isCanceled = true;
          abortController.abort();
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

  /**
   * Tear down the manager, resolving any pending queued modal promises,
   * closing the dialog, and removing elements from the DOM.
   */
  public destroy(): void {
    this.isDestroyed = true;
    const currentJobs = this.jobs;
    this.jobs = [];

    currentJobs.forEach((job) => job.dismiss());
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

  private enqueue(job: ModalJob): void {
    if (this.isDestroyed) {
      return;
    }
    this.jobs.push(job);
    if (!this.isRunning) {
      this.next();
    }
  }

  private next(): void {
    if (this.isDestroyed || this.jobs.length === 0) {
      this.isRunning = false;
      this.activeJob = null;
      return;
    }
    this.isRunning = true;
    this.activeJob = this.jobs.shift()!;
    this.activeJob.run();
  }

  private ensureDialog(): HTMLDialogElement {
    if (!this.dialog) {
      const dialog = document.createElement("dialog");
      dialog.className = DIALOG_CLASS;
      dialog.setAttribute("data-toast-instance", this.instanceId);
      this.parent.appendChild(dialog);
      this.dialog = dialog;
    } else {
      this.dialog.innerHTML = "";
    }
    return this.dialog;
  }

  private closeDialog(dialog: HTMLDialogElement, onClosed: () => void): void {
    if (!dialog.open) {
      onClosed();
      return;
    }

    const style = window.getComputedStyle(dialog);
    const duration = style.transitionDuration || "0s";
    const hasTransition = duration.split(",").some((d) => {
      const val = d.trim();
      return val !== "0s" && val !== "0ms" && val !== "";
    });

    if (!hasTransition) {
      dialog.close();
      onClosed();
      return;
    }

    let hasFinished = false;
    const finish = (): void => {
      if (hasFinished) {
        return;
      }
      hasFinished = true;
      dialog.removeEventListener("transitionend", finish);
      dialog.removeEventListener("transitioncancel", finish);
      clearTimeout(timeoutId);
      onClosed();
    };

    dialog.addEventListener("transitionend", finish);
    dialog.addEventListener("transitioncancel", finish);
    const timeoutId = window.setTimeout(finish, 250);

    dialog.close();
  }
}
