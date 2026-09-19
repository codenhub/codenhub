import { createAlertRenderer, createConfirmRenderer, createPromptRenderer } from "./modal-renderers";
import type { ModalRenderContext, ModalRenderResult } from "./modal-renderers";
import { DIALOG_CLASS, buildDialogContent } from "./modal-templates";
import { closeDialog } from "./modal-transition";
import { joinClassNames } from "./options";
import { assertValidTokens } from "./tokens";
import type { AlertOptions, ConfirmOptions, InteractiveToastHandle, PromptOptions, ToastState } from "./types";

interface ModalJob {
  run(): void;
  dismiss(isForced?: boolean): void;
  fail(error: unknown): void;
}

interface ModalOptions {
  title?: string;
  shouldBackdropDismiss?: boolean;
  tokens?: ConfirmOptions["tokens"];
  className?: string;
}

interface CreateModalParams<T> {
  message: string;
  options: ModalOptions;
  cancelValue: T;
  render(context: ModalRenderContext<T>): ModalRenderResult;
}

/** Serializes native dialogs and owns their complete lifecycle. */
export class ModalController {
  private dialog: HTMLDialogElement | null = null;
  private jobs: ModalJob[] = [];
  private activeJob: ModalJob | null = null;
  private restoreTarget: HTMLElement | null = null;
  private isDestroyed = false;
  private jobCounter = 0;

  public constructor(
    private readonly parent: HTMLElement,
    private readonly instanceId: string,
    private readonly getDefaultClassName: () => string | undefined = () => undefined,
  ) {}

  public confirm(message: string, options: ConfirmOptions = {}): InteractiveToastHandle<boolean> {
    // Cloned before use: the renderer closure below reads label/type fields
    // lazily when the queued job eventually runs, not synchronously here, so
    // a caller-owned object must not still be live at that point.
    const snapshot: ConfirmOptions = { ...options };
    return this.createModal<boolean>({
      message,
      options: snapshot,
      cancelValue: false,
      render: createConfirmRenderer(snapshot),
    });
  }

  public prompt(message: string, options: PromptOptions = {}): InteractiveToastHandle<string | null> {
    const snapshot: PromptOptions = { ...options };
    return this.createModal<string | null>({
      message,
      options: snapshot,
      cancelValue: null,
      render: createPromptRenderer(snapshot),
    });
  }

  public alert(message: string, options: AlertOptions = {}): InteractiveToastHandle<void> {
    const snapshot: AlertOptions = { ...options };
    return this.createModal({
      message,
      options: snapshot,
      cancelValue: undefined,
      render: createAlertRenderer(snapshot),
    });
  }

  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;
    const queuedJobs = this.jobs;
    this.jobs = [];
    queuedJobs.forEach((job) => job.dismiss(true));
    this.activeJob?.dismiss(true);
    this.activeJob = null;
    if (this.dialog) {
      if (this.dialog.open) {
        this.dialog.close();
      }
      this.dialog.remove();
      this.dialog = null;
    }
  }

  private createModal<T>(params: CreateModalParams<T>): InteractiveToastHandle<T> {
    if (params.message.trim().length === 0) {
      throw new Error("Interactive dialog message must not be empty.");
    }
    // Snapshotted rather than referenced: a queued dialog can sit for a
    // while before its job runs, and a caller-owned options object mutated
    // in that window must not reach the eventually-rendered dialog (the
    // same boundary `normalizeToastOptions` in options.ts applies to toasts).
    const options: ModalOptions = {
      title: params.options.title,
      shouldBackdropDismiss: params.options.shouldBackdropDismiss,
      tokens: params.options.tokens ? { ...params.options.tokens } : undefined,
      className: params.options.className,
    };
    assertValidTokens(options.tokens, this.parent.ownerDocument);

    let resolveResult!: (value: T) => void;
    let rejectResult!: (reason: unknown) => void;
    const result = new Promise<T>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });
    let resolveSettled!: () => void;
    const settled = new Promise<void>((resolve) => {
      resolveSettled = resolve;
    });

    const documentRef = this.parent.ownerDocument;
    if (!this.activeJob && this.jobs.length === 0) {
      const activeElement = documentRef.activeElement;
      this.restoreTarget = activeElement instanceof documentRef.defaultView!.HTMLElement ? activeElement : null;
    }
    const abortController = new AbortController();
    let state: ToastState = "queued";
    let dialog: HTMLDialogElement | null = null;
    let focusFrame: number | null = null;
    let hasStarted = false;
    let isClosing = false;
    let isResultSettled = false;
    let isCleanupSettled = false;

    const settleResult = (value: T, error?: unknown): void => {
      if (isResultSettled) {
        return;
      }
      isResultSettled = true;
      if (error === undefined) {
        resolveResult(value);
      } else {
        rejectResult(error);
      }
    };

    const finishCleanup = (): void => {
      if (isCleanupSettled) {
        return;
      }
      isCleanupSettled = true;
      if (focusFrame !== null) {
        documentRef.defaultView?.cancelAnimationFrame(focusFrame);
      }
      abortController.abort();
      state = "hidden";
      resolveSettled();
      this.complete(job);
      this.restoreFocusIfIdle();
    };

    const close = (value: T, isForced = false): void => {
      settleResult(value);
      if (!hasStarted) {
        finishCleanup();
        return;
      }
      if (isClosing && !isForced) {
        return;
      }
      isClosing = true;
      state = "hiding";
      abortController.abort();
      if (!dialog || isForced) {
        if (dialog?.open) {
          dialog.close();
        }
        finishCleanup();
        return;
      }
      closeDialog(dialog, finishCleanup);
    };

    const fail = (error: unknown): void => {
      settleResult(params.cancelValue, error);
      if (dialog?.open) {
        dialog.close();
      }
      finishCleanup();
    };

    const job: ModalJob = {
      run: () => {
        if (isCleanupSettled) {
          this.complete(job);
          return;
        }
        hasStarted = true;
        dialog = this.ensureDialog();
        const idBase = `${this.instanceId}-dialog-${++this.jobCounter}`;
        const messageId = `${idBase}-message`;
        const container = buildDialogContent({
          dialog,
          message: params.message,
          title: options.title,
          tokens: options.tokens,
          className: joinClassNames(this.getDefaultClassName(), options.className),
          titleId: `${idBase}-title`,
          messageId,
        });
        const rendered = params.render({
          container,
          documentRef,
          signal: abortController.signal,
          messageId,
          close: (value) => close(value),
        });

        dialog.addEventListener(
          "cancel",
          (event) => {
            event.preventDefault();
            close(params.cancelValue);
          },
          { signal: abortController.signal },
        );
        // Reconciles a dialog closed through some means other than this
        // controller -- a direct `dialog.close()` call reaching past
        // `close()`/`fail()` entirely. Scoped to the same signal as every
        // other listener here, so it is already removed by the time this
        // controller's own close path runs `abortController.abort()`, and
        // never double-fires for a close this controller itself initiated.
        // `close()` itself is idempotent through `closeDialog`'s own
        // already-closed fast path, so replaying it here is safe.
        dialog.addEventListener("close", () => close(params.cancelValue), { signal: abortController.signal });
        if (options.shouldBackdropDismiss !== false) {
          dialog.addEventListener(
            "click",
            (event) => {
              if (event.target !== dialog) {
                return;
              }
              const rect = dialog!.getBoundingClientRect();
              const mouseEvent = event as MouseEvent;
              const isInside =
                mouseEvent.clientX >= rect.left &&
                mouseEvent.clientX <= rect.right &&
                mouseEvent.clientY >= rect.top &&
                mouseEvent.clientY <= rect.bottom;
              if (!isInside) {
                close(params.cancelValue);
              }
            },
            { signal: abortController.signal },
          );
        }

        dialog.showModal();
        state = "visible";
        if (rendered.shouldDeferFocus) {
          focusFrame = documentRef.defaultView!.requestAnimationFrame(() => {
            if (state === "visible" && rendered.initialFocus.isConnected) {
              rendered.initialFocus.focus();
            }
          });
        } else {
          rendered.initialFocus.focus();
        }
      },
      dismiss: (isForced = false) => close(params.cancelValue, isForced),
      fail,
    };

    this.enqueue(job);
    return {
      dismiss: () => job.dismiss(),
      get settled() {
        return settled;
      },
      get state() {
        return state;
      },
      result,
    };
  }

  private enqueue(job: ModalJob): void {
    if (this.isDestroyed) {
      job.fail(new Error("Modal controller has been destroyed."));
      return;
    }
    this.jobs.push(job);
    this.next();
  }

  private next(): void {
    if (this.isDestroyed || this.activeJob || this.jobs.length === 0) {
      return;
    }
    const job = this.jobs.shift()!;
    this.activeJob = job;
    try {
      job.run();
    } catch (error) {
      job.fail(error);
    }
  }

  private complete(job: ModalJob): void {
    const queueIndex = this.jobs.indexOf(job);
    if (queueIndex >= 0) {
      this.jobs.splice(queueIndex, 1);
    }
    if (this.activeJob === job) {
      this.activeJob = null;
    }
    this.next();
  }

  private restoreFocusIfIdle(): void {
    if (this.activeJob || this.jobs.length > 0) {
      return;
    }
    if (this.restoreTarget?.isConnected) {
      this.restoreTarget.focus();
    }
    this.restoreTarget = null;
  }

  private ensureDialog(): HTMLDialogElement {
    if (!this.dialog) {
      this.dialog = this.parent.ownerDocument.createElement("dialog");
      this.dialog.className = DIALOG_CLASS;
      this.dialog.setAttribute("data-toast-instance", this.instanceId);
      this.parent.appendChild(this.dialog);
    } else {
      this.dialog.replaceChildren();
    }
    return this.dialog;
  }
}
