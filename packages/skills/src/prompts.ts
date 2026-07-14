import readline from "readline";

export const ANSI = {
  HIDE_CURSOR: "\x1b[?25l",
  SHOW_CURSOR: "\x1b[?25h",
  CLEAR_LINE: "\x1b[2K",
  CURSOR_UP: (n: number) => `\x1b[${n}A`,
  RESET: "\x1b[0m",
  BOLD: "\x1b[1m",
  DIM: "\x1b[2m",
  CYAN: "\x1b[36m",
  GREEN: "\x1b[32m",
  RED: "\x1b[31m",
  BLUE: "\x1b[34m",
  YELLOW: "\x1b[33m",
  WHITE: "\x1b[37m",
};

/**
 * Sentinel value resolved by prompts when the user presses the back
 * key. Using a Symbol prevents accidental string collisions.
 */
export const BACK = Symbol("BACK");
export type BackSignal = typeof BACK;

/** Thrown when the user presses Ctrl+C to cancel a prompt. */
export class CancelledError extends Error {
  constructor() {
    super("Cancelled");
    this.name = "CancelledError";
  }
}

export interface Choice {
  name: string;
  value: string;
  checked: boolean;
  description?: string;
}

export interface SelectChoice {
  name: string;
  value: string;
  description?: string;
}

export interface ConfirmOptions {
  defaultValue: boolean;
  canGoBack?: boolean;
}

export interface SelectOptions {
  choices: SelectChoice[];
  initialCursor?: number;
  canGoBack?: boolean;
}

export interface CheckboxOptions {
  choices: Choice[];
  canGoBack?: boolean;
}

type KeyInfo = { ctrl?: boolean; name?: string };

interface PromptRunOptions<T> {
  initialRender: () => void;
  onKey: (key: KeyInfo, resolve: (value: T) => void, reject: (error: Error) => void, cleanup: () => void) => void;
}

/**
 * Shared TTY plumbing: sets up raw mode, keypress events, cursor
 * visibility, and cleanup. Delegates rendering and key handling to the
 * caller via `opts`.
 */
function runPrompt<T>(opts: PromptRunOptions<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    function cleanup() {
      process.stdin.removeListener("keypress", onKeypress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      process.stdout.write(ANSI.SHOW_CURSOR);
    }

    function onKeypress(_str: string | undefined, key: KeyInfo | undefined) {
      if (key?.ctrl && key.name === "c") {
        cleanup();
        reject(new CancelledError());
        return;
      }
      if (!key) {
        return;
      }
      try {
        opts.onKey(key, resolve, reject, cleanup);
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    }

    process.stdout.write(ANSI.HIDE_CURSOR);

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    readline.emitKeypressEvents(process.stdin);
    process.stdin.on("keypress", onKeypress);

    try {
      opts.initialRender();
    } catch (err) {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/**
 * Multi-selection checkbox prompt.
 *
 * In non-TTY environments returns the pre-checked values immediately
 * without prompting.
 */
export function promptCheckbox(message: string, options: CheckboxOptions): Promise<string[] | BackSignal> {
  const { choices, canGoBack = false } = options;

  if (!process.stdin.isTTY) {
    return Promise.resolve(choices.filter((c) => c.checked).map((c) => c.value));
  }

  if (choices.length === 0) {
    return Promise.resolve([]);
  }

  let cursor = 0;

  function render(isFirst = false) {
    const { stdout } = process;
    if (!isFirst) {
      stdout.write(ANSI.CURSOR_UP(choices.length + 2));
    }

    stdout.write(`${ANSI.BOLD}${ANSI.CYAN}? ${ANSI.WHITE}${message}${ANSI.RESET}\n`);

    for (const [index, choice] of choices.entries()) {
      const isCurrent = index === cursor;
      const pointer = isCurrent ? `${ANSI.CYAN}❯${ANSI.RESET}` : " ";
      const checkbox = choice.checked ? `${ANSI.GREEN}[◼]${ANSI.RESET}` : "[ ]";
      const name = isCurrent ? `${ANSI.CYAN}${ANSI.BOLD}${choice.name}${ANSI.RESET}` : choice.name;
      const desc = choice.description ? ` ${ANSI.DIM}(${choice.description})${ANSI.RESET}` : "";
      stdout.write(`${ANSI.CLEAR_LINE}${pointer} ${checkbox} ${name}${desc}\n`);
    }

    const backInstruction = canGoBack ? ", Backspace/Left to go back" : "";
    stdout.write(
      `${ANSI.CLEAR_LINE}${ANSI.DIM}(Use arrows to navigate, Space to toggle, Enter to confirm${backInstruction}, Ctrl+C to exit)${ANSI.RESET}\n`,
    );
  }

  return runPrompt<string[] | BackSignal>({
    initialRender: () => render(true),
    onKey: (key, resolve, _reject, cleanup) => {
      switch (key.name) {
        case "up":
          cursor = (cursor - 1 + choices.length) % choices.length;
          render();
          break;
        case "down":
          cursor = (cursor + 1) % choices.length;
          render();
          break;
        case "space":
          choices[cursor].checked = !choices[cursor].checked;
          render();
          break;
        case "left":
        case "backspace":
          if (canGoBack) {
            cleanup();
            resolve(BACK);
          }
          break;
        case "return": {
          cleanup();
          const selectedValues = choices.filter((c) => c.checked).map((c) => c.value);
          process.stdout.write(`${ANSI.CLEAR_LINE}\r${ANSI.GREEN}✔${ANSI.RESET} Selection confirmed.\n`);
          resolve(selectedValues);
          break;
        }
      }
    },
  });
}

/**
 * Yes/No confirmation prompt. Delegates to `selectPrompt` with two
 * fixed choices.
 *
 * In non-TTY environments returns `defaultValue` immediately without
 * prompting.
 */
export async function promptConfirm(message: string, options: ConfirmOptions): Promise<boolean | BackSignal> {
  const { defaultValue, canGoBack = false } = options;
  const choices: SelectChoice[] = [
    { name: "Yes", value: "yes" },
    { name: "No", value: "no" },
  ];
  const initialCursor = defaultValue ? 0 : 1;
  const selected = await promptSelect(message, { choices, initialCursor, canGoBack });
  if (selected === BACK) {
    return BACK;
  }
  return selected === "yes";
}

/**
 * Single-selection list prompt.
 *
 * In non-TTY environments returns the choice at `initialCursor`
 * immediately without prompting.
 *
 * @throws {Error} When `choices` is empty.
 */
export function promptSelect(message: string, options: SelectOptions): Promise<string | BackSignal> {
  const { choices, initialCursor = 0, canGoBack = false } = options;

  if (choices.length === 0) {
    throw new Error("selectPrompt: choices must not be empty");
  }

  if (!process.stdin.isTTY) {
    return Promise.resolve(choices[initialCursor]?.value ?? choices[0].value);
  }

  let cursor = initialCursor;

  function render(isFirst = false) {
    const { stdout } = process;
    if (!isFirst) {
      stdout.write(ANSI.CURSOR_UP(choices.length + 2));
    }

    stdout.write(`${ANSI.BOLD}${ANSI.CYAN}? ${ANSI.WHITE}${message}${ANSI.RESET}\n`);

    for (const [index, choice] of choices.entries()) {
      const isCurrent = index === cursor;
      const pointer = isCurrent ? `${ANSI.CYAN}❯${ANSI.RESET}` : " ";
      const name = isCurrent ? `${ANSI.CYAN}${ANSI.BOLD}${choice.name}${ANSI.RESET}` : choice.name;
      const desc = choice.description ? ` ${ANSI.DIM}(${choice.description})${ANSI.RESET}` : "";
      stdout.write(`${ANSI.CLEAR_LINE}${pointer} ${name}${desc}\n`);
    }

    const backInstruction = canGoBack ? ", Backspace/Left to go back" : "";
    stdout.write(
      `${ANSI.CLEAR_LINE}${ANSI.DIM}(Use arrows to navigate${backInstruction}, Enter to confirm, Ctrl+C to exit)${ANSI.RESET}\n`,
    );
  }

  return runPrompt<string | BackSignal>({
    initialRender: () => render(true),
    onKey: (key, resolve, _reject, cleanup) => {
      switch (key.name) {
        case "up":
          cursor = (cursor - 1 + choices.length) % choices.length;
          render();
          break;
        case "down":
          cursor = (cursor + 1) % choices.length;
          render();
          break;
        case "left":
        case "backspace":
          if (canGoBack) {
            cleanup();
            resolve(BACK);
          }
          break;
        case "return": {
          cleanup();
          const selectedValue = choices[cursor].value;
          process.stdout.write(`${ANSI.CLEAR_LINE}\r${ANSI.GREEN}✔${ANSI.RESET} Selection: ${choices[cursor].name}\n`);
          resolve(selectedValue);
          break;
        }
      }
    },
  });
}
