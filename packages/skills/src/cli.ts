import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";

interface Skill {
  id: string;
  name: string;
  description: string;
  path: string;
}

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
      const value = line.slice(colonIndex + 1).trim();
      metadata[key] = value;
    }
  }
  return metadata;
}

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

export function copyRecursiveSync(src: string, dest: string, ignoreList: string[] = []): void {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats && stats.isDirectory();

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find skills source directory
let skillsSrcDir = path.resolve(__dirname, "../src");
if (
  !fs.existsSync(skillsSrcDir) ||
  !fs.readdirSync(skillsSrcDir).some((f) => fs.statSync(path.join(skillsSrcDir, f)).isDirectory())
) {
  skillsSrcDir = __dirname;
}

const home = os.homedir();

const HARNESS_MAPPING: Record<string, string> = {
  "Antigravity Global": path.join(home, ".gemini/config/skills"),
  "Antigravity Workspace": path.resolve("./.agents/skills"),
  "OpenCode Global": path.join(home, ".config/opencode/skills"),
  "OpenCode Workspace": path.resolve("./.opencode/skills"),
  "Claude Global": path.join(home, ".claude/skills"),
  "Claude Workspace": path.resolve("./.claude/skills"),
  "Codex Global": path.join(home, ".codex/skills"),
  "Codex Workspace": path.resolve("./.codex/skills"),
};

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

const CONSTANTS = {
  CODEX_IDENTIFIER: "Codex",
  EXCLUDE_FOLDER_AGENTS: "agents",
};

interface Choice {
  name: string;
  value: string;
  checked: boolean;
  description?: string;
}

function checkboxPrompt(message: string, choices: Choice[]): Promise<string[]> {
  return new Promise((resolve) => {
    const stdout = process.stdout;
    if (!process.stdin.isTTY) {
      resolve(choices.filter((c) => c.checked).map((c) => c.value));
      return;
    }
    let cursor = 0;

    // Hide terminal cursor
    stdout.write(ANSI.HIDE_CURSOR);

    function render(first = false) {
      if (!first) {
        // Move cursor up to overwrite previous render
        const linesToMove = choices.length + 2;
        stdout.write(ANSI.CURSOR_UP(linesToMove));
      }

      // Title/Message
      stdout.write(`${ANSI.BOLD}${ANSI.CYAN}? ${ANSI.WHITE}${message}${ANSI.RESET}\n`);

      // Choices
      choices.forEach((choice, index) => {
        const isCurrent = index === cursor;
        const pointer = isCurrent ? `${ANSI.CYAN}❯${ANSI.RESET}` : " ";
        const checkbox = choice.checked ? `${ANSI.GREEN}[◼]${ANSI.RESET}` : "[ ]";
        const name = isCurrent ? `${ANSI.CYAN}${ANSI.BOLD}${choice.name}${ANSI.RESET}` : choice.name;
        const desc = choice.description ? ` ${ANSI.DIM}(${choice.description})${ANSI.RESET}` : "";

        stdout.write(`${ANSI.CLEAR_LINE}${pointer} ${checkbox} ${name}${desc}\n`);
      });

      // Instructions
      stdout.write(
        `${ANSI.CLEAR_LINE}${ANSI.DIM}(Use arrows to navigate, Space to toggle, Enter to confirm, Ctrl+C to exit)${ANSI.RESET}\n`,
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
      stdout.write(ANSI.SHOW_CURSOR); // Show cursor
    }

    // Setup keypress listener
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    const readline = require("readline");
    readline.emitKeypressEvents(process.stdin);

    process.stdin.on("keypress", onKeypress);
  });
}

// Helper to use require safely in ESM
import { createRequire } from "module";
const require = createRequire(import.meta.url);

async function main() {
  console.log(`\n${ANSI.BOLD}${ANSI.CYAN}=========================================${ANSI.RESET}`);
  console.log(`${ANSI.BOLD}${ANSI.CYAN}    Codenhub AI Agent Skills Installer${ANSI.RESET}`);
  console.log(`${ANSI.BOLD}${ANSI.CYAN}=========================================${ANSI.RESET}\n`);

  const skills = getSkills(skillsSrcDir);
  if (skills.length === 0) {
    console.error(`${ANSI.RED}Error: No skills found in source directory.${ANSI.RESET}`);
    process.exit(1);
  }

  // 1. Prompt for skills selection
  const skillChoices: Choice[] = skills.map((s) => ({
    name: s.name,
    value: s.id,
    checked: true,
    description: s.description,
  }));

  const selectedSkills = await checkboxPrompt("Which skills do you want to install?", skillChoices);
  if (selectedSkills.length === 0) {
    console.log(`\n${ANSI.YELLOW}No skills selected. Exiting.${ANSI.RESET}`);
    process.exit(0);
  }

  // 2. Prompt for harnesses selection
  const harnessChoices: Choice[] = Object.keys(HARNESS_MAPPING).map((name) => ({
    name,
    value: name,
    checked: true,
    description: HARNESS_MAPPING[name],
  }));

  const selectedHarnesses = await checkboxPrompt("Which harnesses do you want to install to?", harnessChoices);
  if (selectedHarnesses.length === 0) {
    console.log(`\n${ANSI.YELLOW}No harnesses selected. Exiting.${ANSI.RESET}`);
    process.exit(0);
  }

  console.log(`\n${ANSI.BOLD}Installing skills...${ANSI.RESET}\n`);

  for (const harness of selectedHarnesses) {
    const destBaseDir = HARNESS_MAPPING[harness];
    const isCodex = harness.includes(CONSTANTS.CODEX_IDENTIFIER);
    console.log(`${ANSI.BLUE}→ Installing to ${harness}...${ANSI.RESET}`);

    for (const skillId of selectedSkills) {
      const skill = skills.find((s) => s.id === skillId);
      if (!skill) {
        continue;
      }

      const destSkillDir = path.join(destBaseDir, skillId);
      try {
        copyRecursiveSync(skill.path, destSkillDir, isCodex ? [] : [CONSTANTS.EXCLUDE_FOLDER_AGENTS]);
        console.log(`  ${ANSI.GREEN}✔${ANSI.RESET} Copied: ${skill.name}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ${ANSI.RED}✘${ANSI.RESET} Failed copying ${skill.name}: ${msg}`);
      }
    }
  }

  console.log(`\n${ANSI.GREEN}${ANSI.BOLD}✔ All selected skills successfully installed/updated!${ANSI.RESET}\n`);
}

if (typeof process !== "undefined" && !process.env.VITEST) {
  // eslint-disable-next-line promise/prefer-await-to-then
  /* oxlint-disable promise/prefer-await-to-then */
  main().catch((err) => {
    console.error(`${ANSI.RED}Unhandled exception:${ANSI.RESET}`, err);
    process.exit(1);
  });
}
