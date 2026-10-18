export interface ClipboardWriter {
  writeText(text: string): Promise<void>;
}

/** The parts of a copy button the feedback reads and writes; an `HTMLButtonElement` satisfies it. */
export interface CopyButtonControl {
  dataset: Record<string, string | undefined>;
  title: string;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
}

/** The live region that announces the result; an `HTMLElement` satisfies it. */
export interface CopyStatusControl {
  textContent: string | null;
}

export interface CopyRequest {
  button: CopyButtonControl;
  status: CopyStatusControl;
  /** The clipboard to write to, usually `navigator.clipboard`; `undefined` counts as a failed copy. */
  clipboard: ClipboardWriter | undefined;
  text: string;
}

export interface CopyController {
  copy(request: CopyRequest): Promise<void>;
}

interface RestLabels {
  ariaLabel: string;
  title: string;
}

const COPY_FEEDBACK_DURATION_MS = 2000;

async function copyText(text: string, clipboard: ClipboardWriter | undefined): Promise<boolean> {
  if (clipboard === undefined) {
    return false;
  }

  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates the clipboard feedback shared by every copy button: while the write is
 * pending the button shows its resting state, then `data-copy-state` is `copied`
 * or `failed`, the label and status say so, and after 2000 ms the button returns
 * to the `aria-label` and `title` it had before its first copy. When clicks
 * overlap, only the latest one shows its result.
 */
export function createCopyController(): CopyController {
  const restLabels = new WeakMap<CopyButtonControl, RestLabels>();
  const resetTimers = new WeakMap<CopyButtonControl, ReturnType<typeof setTimeout>>();
  const requestGenerations = new WeakMap<CopyButtonControl, number>();

  const reset = (button: CopyButtonControl, status: CopyStatusControl): void => {
    const labels = restLabels.get(button);
    delete button.dataset.copyState;
    button.title = labels?.title ?? "";
    button.setAttribute("aria-label", labels?.ariaLabel ?? "");
    status.textContent = "";
  };

  const begin = (button: CopyButtonControl, status: CopyStatusControl): void => {
    if (!restLabels.has(button)) {
      restLabels.set(button, { ariaLabel: button.getAttribute("aria-label") ?? "", title: button.title });
    }
    clearTimeout(resetTimers.get(button));
    resetTimers.delete(button);
    reset(button, status);
  };

  const showResult = (button: CopyButtonControl, status: CopyStatusControl, isCopied: boolean): void => {
    button.dataset.copyState = isCopied ? "copied" : "failed";
    button.title = isCopied ? "Copied" : "Copy failed";
    button.setAttribute("aria-label", isCopied ? "Copied" : "Copy failed. Try again");
    status.textContent = isCopied ? "Copied" : "Copy failed";

    resetTimers.set(
      button,
      setTimeout(() => {
        reset(button, status);
        resetTimers.delete(button);
      }, COPY_FEEDBACK_DURATION_MS),
    );
  };

  return {
    async copy({ button, clipboard, status, text }) {
      const generation = (requestGenerations.get(button) ?? 0) + 1;
      requestGenerations.set(button, generation);
      begin(button, status);

      const isCopied = await copyText(text, clipboard);
      if (requestGenerations.get(button) !== generation) {
        return;
      }
      showResult(button, status, isCopied);
    },
  };
}
