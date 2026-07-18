export interface ClipboardWriter {
  writeText(text: string): Promise<void>;
}

interface CopyButtonControl {
  dataset: Record<string, string | undefined>;
  title: string;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
}

interface CopyStatusControl {
  textContent: string | null;
}

interface CopyFeedbackTarget {
  button: CopyButtonControl;
  status: CopyStatusControl;
}

interface CopyFeedbackResult extends CopyFeedbackTarget {
  isCopied: boolean;
}

interface CodeCopyFeedback {
  begin(target: CopyFeedbackTarget): void;
  showResult(result: CopyFeedbackResult): void;
}

interface CopyRequest extends CopyFeedbackTarget {
  clipboard: ClipboardWriter | undefined;
  code: string;
}

interface CodeCopyController {
  copy(request: CopyRequest): Promise<void>;
}

const COPY_FEEDBACK_DURATION_MS = 2000;

export async function copyCodeText(code: string, clipboard: ClipboardWriter | undefined): Promise<boolean> {
  if (clipboard === undefined) {
    return false;
  }

  try {
    await clipboard.writeText(code);
    return true;
  } catch {
    return false;
  }
}

export function findCodeCopyStatus(button: HTMLButtonElement): HTMLElement | null {
  const statusId = button.getAttribute("aria-describedby");
  if (statusId === null) {
    return null;
  }
  return button.closest(".code-block")?.querySelector<HTMLElement>(`#${statusId}`) ?? null;
}

export function createCodeCopyFeedback(): CodeCopyFeedback {
  const defaultLabels = new WeakMap<CopyButtonControl, string>();
  const resetTimers = new WeakMap<CopyButtonControl, ReturnType<typeof setTimeout>>();

  const begin = ({ button, status }: CopyFeedbackTarget): void => {
    if (!defaultLabels.has(button)) {
      defaultLabels.set(button, button.getAttribute("aria-label") ?? "Copy code");
    }
    const previousTimer = resetTimers.get(button);
    if (previousTimer !== undefined) {
      clearTimeout(previousTimer);
      resetTimers.delete(button);
    }
    delete button.dataset.copyState;
    button.title = "Copy code";
    button.setAttribute("aria-label", defaultLabels.get(button) ?? "Copy code");
    status.textContent = "";
  };

  return {
    begin,
    showResult({ button, isCopied, status }) {
      begin({ button, status });
      button.dataset.copyState = isCopied ? "copied" : "failed";
      button.title = isCopied ? "Copied" : "Copy failed";
      button.setAttribute("aria-label", isCopied ? "Copied" : "Copy failed. Try again");
      status.textContent = isCopied ? "Copied" : "Copy failed";

      resetTimers.set(
        button,
        setTimeout(() => {
          delete button.dataset.copyState;
          button.title = "Copy code";
          button.setAttribute("aria-label", defaultLabels.get(button) ?? "Copy code");
          status.textContent = "";
          resetTimers.delete(button);
        }, COPY_FEEDBACK_DURATION_MS),
      );
    },
  };
}

export function createCodeCopyController(): CodeCopyController {
  const feedback = createCodeCopyFeedback();
  const requestGenerations = new WeakMap<CopyButtonControl, number>();

  return {
    async copy(request) {
      const generation = (requestGenerations.get(request.button) ?? 0) + 1;
      requestGenerations.set(request.button, generation);
      feedback.begin(request);

      const isCopied = await copyCodeText(request.code, request.clipboard);
      if (requestGenerations.get(request.button) !== generation) {
        return;
      }
      feedback.showResult({ ...request, isCopied });
    },
  };
}
