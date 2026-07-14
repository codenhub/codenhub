import * as fs from "fs";
import * as path from "path";
import readline from "readline";

export interface Skill {
  id: string;
  name: string;
  description: string;
  path: string;
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

const ANSI = {
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
 * Parses frontmatter metadata from markdown content.
 */
export function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\r?\n([\s\S]+?)\r?\n---/);
  const metadata: Record<string, string> = {};
  if (!match) {
    return metadata;
  }

  const lines = match[1].split(/\r?\n/);
  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex !== -1) {
      const key = line.slice(0, colonIndex).trim();
      const rawValue = line.slice(colonIndex + 1).trim();
      // Remove matching surrounding quotes if present
      const value = rawValue.replace(/^(['"])([\s\S]*)\1$/, "$2");
      metadata[key] = value;
    }
  }
  return metadata;
}

/**
 * Lists all valid skills inside the source directory.
 */
export function getSkills(srcDir: string): Skill[] {
  if (!fs.existsSync(srcDir)) {
    return [];
  }

  const items = fs.readdirSync(srcDir);
  const skills: Skill[] = [];

  for (const item of items) {
    const itemPath = path.join(srcDir, item);
    const stat = fs.statSync(itemPath);

    if (stat.isDirectory()) {
      const skillMdPath = path.join(itemPath, "SKILL.md");
      if (fs.existsSync(skillMdPath)) {
        const content = fs.readFileSync(skillMdPath, "utf8");
        const meta = parseFrontmatter(content);
        skills.push({
          id: item,
          name: meta.name || item,
          description: meta.description || "",
          path: itemPath,
        });
      }
    }
  }

  return skills;
}

/**
 * Recursively copies files and directories, ignoring specified file/folder names.
 */
export function copyRecursiveSync(src: string, dest: string, ignoreList: string[] = []): void {
  const exists = fs.existsSync(src);
  if (!exists) {
    throw new Error(`Source path "${src}" does not exist`);
  }
  const stats = fs.statSync(src);
  const isDirectory = stats.isDirectory();

  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      if (ignoreList.includes(childItemName)) {
        return;
      }
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName), ignoreList);
    });
  } else {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
  }
}

/**
 * Prompt user with a checkbox select list.
 */
export function checkboxPrompt(message: string, options: CheckboxOptions): Promise<string[] | "__BACK__"> {
  const { choices, canGoBack = false } = options;

  return new Promise((resolve) => {
    const stdout = process.stdout;
    if (!process.stdin.isTTY) {
      resolve(choices.filter((c) => c.checked).map((c) => c.value));
      return;
    }
    let cursor = 0;

    stdout.write(ANSI.HIDE_CURSOR);

    function render(isFirst = false) {
      if (!isFirst) {
        const linesToMove = choices.length + 2;
        stdout.write(ANSI.CURSOR_UP(linesToMove));
      }

      stdout.write(`${ANSI.BOLD}${ANSI.CYAN}? ${ANSI.WHITE}${message}${ANSI.RESET}\n`);

      choices.forEach((choice, index) => {
        const isCurrent = index === cursor;
        const pointer = isCurrent ? `${ANSI.CYAN}❯${ANSI.RESET}` : " ";
        const checkbox = choice.checked ? `${ANSI.GREEN}[◼]${ANSI.RESET}` : "[ ]";
        const name = isCurrent ? `${ANSI.CYAN}${ANSI.BOLD}${choice.name}${ANSI.RESET}` : choice.name;
        const desc = choice.description ? ` ${ANSI.DIM}(${choice.description})${ANSI.RESET}` : "";

        stdout.write(`${ANSI.CLEAR_LINE}${pointer} ${checkbox} ${name}${desc}\n`);
      });

      const backInstruction = canGoBack ? ", Backspace/Left to go back" : "";
      stdout.write(
        `${ANSI.CLEAR_LINE}${ANSI.DIM}(Use arrows to navigate, Space to toggle, Enter to confirm${backInstruction}, Ctrl+C to exit)${ANSI.RESET}\n`,
      );
    }

    render(true);

    function onKeypress(_str: string | undefined, key: { ctrl?: boolean; name?: string } | undefined) {
      if (key && key.ctrl && key.name === "c") {
        cleanup();
        stdout.write(`\n${ANSI.RED}Installation cancelled.${ANSI.RESET}\n`);
        process.exit(0);
      }

      if (!key) {
        return;
      }

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
            resolve("__BACK__");
          }
          break;
        case "return":
          cleanup();
          const selectedValues = choices.filter((c) => c.checked).map((c) => c.value);
          stdout.write(`${ANSI.CLEAR_LINE}\r${ANSI.GREEN}✔${ANSI.RESET} Selection confirmed.\n`);
          resolve(selectedValues);
          break;
      }
    }

    function cleanup() {
      process.stdin.removeListener("keypress", onKeypress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      stdout.write(ANSI.SHOW_CURSOR);
    }

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    readline.emitKeypressEvents(process.stdin);
    process.stdin.on("keypress", onKeypress);
  });
}

/**
 * Prompt user with a yes/no confirmation.
 */
export async function confirmPrompt(message: string, options: ConfirmOptions): Promise<boolean | "__BACK__"> {
  const { defaultValue, canGoBack = false } = options;
  const choices: SelectChoice[] = [
    { name: "Yes", value: "yes" },
    { name: "No", value: "no" },
  ];
  const initialCursor = defaultValue ? 0 : 1;
  const selected = await selectPrompt(message, {
    choices,
    initialCursor,
    canGoBack,
  });
  if (selected === "__BACK__") {
    return "__BACK__";
  }
  return selected === "yes";
}

/**
 * Prompt user with a single selection list.
 */
export function selectPrompt(message: string, options: SelectOptions): Promise<string> {
  const { choices, initialCursor = 0, canGoBack = false } = options;

  return new Promise((resolve) => {
    const stdout = process.stdout;
    if (!process.stdin.isTTY) {
      resolve(choices[initialCursor]?.value ?? choices[0].value);
      return;
    }
    let cursor = initialCursor;

    stdout.write(ANSI.HIDE_CURSOR);

    function render(isFirst = false) {
      if (!isFirst) {
        const linesToMove = choices.length + 2;
        stdout.write(ANSI.CURSOR_UP(linesToMove));
      }

      stdout.write(`${ANSI.BOLD}${ANSI.CYAN}? ${ANSI.WHITE}${message}${ANSI.RESET}\n`);

      choices.forEach((choice, index) => {
        const isCurrent = index === cursor;
        const pointer = isCurrent ? `${ANSI.CYAN}❯${ANSI.RESET}` : " ";
        const name = isCurrent ? `${ANSI.CYAN}${ANSI.BOLD}${choice.name}${ANSI.RESET}` : choice.name;
        const desc = choice.description ? ` ${ANSI.DIM}(${choice.description})${ANSI.RESET}` : "";

        stdout.write(`${ANSI.CLEAR_LINE}${pointer} ${name}${desc}\n`);
      });

      const backInstruction = canGoBack ? ", Backspace/Left to go back" : "";
      stdout.write(
        `${ANSI.CLEAR_LINE}${ANSI.DIM}(Use arrows to navigate${backInstruction}, Enter to confirm, Ctrl+C to exit)${ANSI.RESET}\n`,
      );
    }

    render(true);

    function onKeypress(_str: string | undefined, key: { ctrl?: boolean; name?: string } | undefined) {
      if (key && key.ctrl && key.name === "c") {
        cleanup();
        stdout.write(`\n${ANSI.RED}Installation cancelled.${ANSI.RESET}\n`);
        process.exit(0);
      }

      if (!key) {
        return;
      }

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
            resolve("__BACK__");
          }
          break;
        case "return":
          cleanup();
          const selectedValue = choices[cursor].value;
          stdout.write(`${ANSI.CLEAR_LINE}\r${ANSI.GREEN}✔${ANSI.RESET} Selection: ${choices[cursor].name}\n`);
          resolve(selectedValue);
          break;
      }
    }

    function cleanup() {
      process.stdin.removeListener("keypress", onKeypress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      stdout.write(ANSI.SHOW_CURSOR);
    }

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    readline.emitKeypressEvents(process.stdin);
    process.stdin.on("keypress", onKeypress);
  });
}
