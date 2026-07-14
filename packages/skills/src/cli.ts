import * as fs from "fs";
import { createRequire } from "module";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);

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

function checkboxPrompt(message: string, choices: Choice[], canGoBack = false): Promise<string[] | "__BACK__"> {
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

export interface SelectChoice {
  name: string;
  value: string;
  description?: string;
}

export async function confirmPrompt(
  message: string,
  defaultValue: boolean,
  canGoBack = false,
): Promise<boolean | "__BACK__"> {
  const choices: SelectChoice[] = [
    { name: "Yes", value: "yes" },
    { name: "No", value: "no" },
  ];
  const initialCursor = defaultValue ? 0 : 1;
  const selected = await selectPrompt(message, choices, initialCursor, canGoBack);
  if (selected === "__BACK__") {
    return "__BACK__";
  }
  return selected === "yes";
}

export function selectPrompt(
  message: string,
  choices: SelectChoice[],
  initialCursor = 0,
  canGoBack = false,
): Promise<string> {
  return new Promise((resolve) => {
    const stdout = process.stdout;
    if (!process.stdin.isTTY) {
      resolve(choices[initialCursor]?.value ?? choices[0].value);
      return;
    }
    let cursor = initialCursor;

    stdout.write(ANSI.HIDE_CURSOR);

    function render(first = false) {
      if (!first) {
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

    const readline = require("readline");
    readline.emitKeypressEvents(process.stdin);

    process.stdin.on("keypress", onKeypress);
  });
}

async function main() {
  const skills = getSkills(skillsSrcDir);
  if (skills.length === 0) {
    console.error(`${ANSI.RED}Error: No skills found in source directory.${ANSI.RESET}`);
    process.exit(1);
  }

  const state = {
    scope: "local",
    installAll: true,
    selectedSkills: skills.map((s) => s.id),
    selectedHarnesses: [] as string[],
    cleanupFirst: false,
  };

  const steps = [
    {
      id: "scope",
      title: "Select Scope",
      run: async (canGoBack: boolean) => {
        const scopeChoices: SelectChoice[] = [
          { name: "Locally (project workspace)", value: "local" },
          { name: "Globally (user home directory)", value: "global" },
          { name: "Both", value: "both" },
        ];
        const defaultIndex = scopeChoices.findIndex((c) => c.value === state.scope);
        const selected = await selectPrompt(
          "Where do you want to install the skills?",
          scopeChoices,
          defaultIndex !== -1 ? defaultIndex : 0,
          canGoBack,
        );
        if (selected === "__BACK__") {
          return "__BACK__";
        }
        state.scope = selected;
        return true;
      },
    },
    {
      id: "installAll",
      title: "All Skills Option",
      run: async (canGoBack: boolean) => {
        const selected = await confirmPrompt(
          "Do you want to install all available skills?",
          state.installAll,
          canGoBack,
        );
        if (selected === "__BACK__") {
          return "__BACK__";
        }
        state.installAll = selected;
        return true;
      },
    },
    {
      id: "selectSkills",
      title: "Select Individual Skills",
      run: async (canGoBack: boolean) => {
        const skillChoices: Choice[] = skills.map((s) => ({
          name: s.name,
          value: s.id,
          checked: state.selectedSkills.includes(s.id),
          description: s.description,
        }));
        const selected = await checkboxPrompt("Which skills do you want to install?", skillChoices, canGoBack);
        if (selected === "__BACK__") {
          return "__BACK__";
        }
        if (selected.length === 0) {
          console.log(`\n${ANSI.YELLOW}No skills selected. Exiting.${ANSI.RESET}`);
          process.exit(0);
        }
        state.selectedSkills = selected;
        return true;
      },
    },
    {
      id: "harnesses",
      title: "Select Harnesses",
      run: async (canGoBack: boolean) => {
        const filteredHarnessMapping: Record<string, string> = {};
        for (const name of Object.keys(HARNESS_MAPPING)) {
          const isGlobal = name.includes("Global");
          const isWorkspace = name.includes("Workspace");
          if (state.scope === "both") {
            filteredHarnessMapping[name] = HARNESS_MAPPING[name];
          } else if (state.scope === "global" && isGlobal) {
            filteredHarnessMapping[name] = HARNESS_MAPPING[name];
          } else if (state.scope === "local" && isWorkspace) {
            filteredHarnessMapping[name] = HARNESS_MAPPING[name];
          }
        }

        const harnessChoices: Choice[] = Object.keys(filteredHarnessMapping).map((name) => {
          const isChecked = state.selectedHarnesses.length > 0 ? state.selectedHarnesses.includes(name) : true;
          return {
            name,
            value: name,
            checked: isChecked,
            description: filteredHarnessMapping[name],
          };
        });

        const selected = await checkboxPrompt("Which harnesses do you want to install to?", harnessChoices, canGoBack);
        if (selected === "__BACK__") {
          return "__BACK__";
        }
        if (selected.length === 0) {
          console.log(`\n${ANSI.YELLOW}No harnesses selected. Exiting.${ANSI.RESET}`);
          process.exit(0);
        }
        state.selectedHarnesses = selected;
        return true;
      },
    },
    {
      id: "cleanup",
      title: "Clean Up Option",
      run: async (canGoBack: boolean) => {
        const selected = await confirmPrompt(
          "Do you want to clean up target directories before installing (deleting all existing files/folders inside them)?",
          state.cleanupFirst,
          canGoBack,
        );
        if (selected === "__BACK__") {
          return "__BACK__";
        }
        state.cleanupFirst = selected;
        return true;
      },
    },
  ];

  function getActiveSteps() {
    const active = [];
    active.push(steps[0]); // scope
    active.push(steps[1]); // installAll
    if (!state.installAll) {
      active.push(steps[2]); // selectSkills
    }
    active.push(steps[3]); // harnesses
    active.push(steps[4]); // cleanup
    return active;
  }

  function clearScreen() {
    process.stdout.write("\x1Bc");
  }

  function drawHeader() {
    console.log(`${ANSI.BOLD}${ANSI.CYAN}=========================================${ANSI.RESET}`);
    console.log(`${ANSI.BOLD}${ANSI.CYAN}    Codenhub AI Agent Skills Installer${ANSI.RESET}`);
    console.log(`${ANSI.BOLD}${ANSI.CYAN}=========================================${ANSI.RESET}\n`);
  }

  function drawSummary(currentIdx: number, activeStepsList: typeof steps) {
    for (let i = 0; i < currentIdx; i++) {
      const step = activeStepsList[i];
      let summaryText = "";
      if (step.id === "scope") {
        const scopeName =
          state.scope === "local"
            ? "Locally (project workspace)"
            : state.scope === "global"
              ? "Globally (user home directory)"
              : "Both";
        summaryText = scopeName;
      } else if (step.id === "installAll") {
        summaryText = state.installAll ? "Yes" : "No";
      } else if (step.id === "selectSkills") {
        summaryText = state.selectedSkills.join(", ");
      } else if (step.id === "harnesses") {
        summaryText = state.selectedHarnesses.join(", ");
      } else if (step.id === "cleanup") {
        summaryText = state.cleanupFirst ? "Yes" : "No";
      }
      console.log(`${ANSI.GREEN}✔${ANSI.RESET} ${ANSI.BOLD}${step.title}:${ANSI.RESET} ${summaryText}`);
    }
    if (currentIdx > 0) {
      console.log(""); // Empty line after summaries
    }

    if (currentIdx < activeStepsList.length) {
      const step = activeStepsList[currentIdx];
      console.log(
        `${ANSI.BOLD}${ANSI.BLUE}[Step ${currentIdx + 1}/${activeStepsList.length}] ${step.title}${ANSI.RESET}\n`,
      );
    }
  }

  let activeSteps = getActiveSteps();
  let currentIdx = 0;

  while (currentIdx < activeSteps.length) {
    clearScreen();
    drawHeader();
    drawSummary(currentIdx, activeSteps);

    const step = activeSteps[currentIdx];
    const canGoBack = currentIdx > 0;

    // eslint-disable-next-line no-await-in-loop
    /* oxlint-disable no-await-in-loop */
    const success = await step.run(canGoBack);

    const nextActiveSteps = getActiveSteps();
    if (success === "__BACK__") {
      const newIdx = nextActiveSteps.findIndex((s) => s.id === step.id);
      currentIdx = newIdx - 1;
    } else {
      const newIdx = nextActiveSteps.findIndex((s) => s.id === step.id);
      currentIdx = newIdx + 1;
    }
    activeSteps = nextActiveSteps;
  }

  // Clear one last time and show final completed summary
  clearScreen();
  drawHeader();
  drawSummary(activeSteps.length, activeSteps);

  const skillsToInstall = state.installAll ? skills.map((s) => s.id) : state.selectedSkills;

  if (state.cleanupFirst) {
    console.log(`${ANSI.YELLOW}Cleaning up target directories...${ANSI.RESET}`);
    for (const harness of state.selectedHarnesses) {
      const destBaseDir = HARNESS_MAPPING[harness];
      if (destBaseDir && fs.existsSync(destBaseDir)) {
        try {
          fs.rmSync(destBaseDir, { recursive: true, force: true });
          console.log(`  ${ANSI.GREEN}✔${ANSI.RESET} Cleaned: ${destBaseDir}`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`  ${ANSI.RED}✘${ANSI.RESET} Failed cleaning ${destBaseDir}: ${msg}`);
        }
      }
    }
    console.log("");
  }

  console.log(`${ANSI.BOLD}Installing skills...${ANSI.RESET}\n`);

  for (const harness of state.selectedHarnesses) {
    const destBaseDir = HARNESS_MAPPING[harness];
    if (!destBaseDir) {
      continue;
    }
    const isCodex = harness.includes(CONSTANTS.CODEX_IDENTIFIER);
    console.log(`${ANSI.BLUE}→ Installing to ${harness}...${ANSI.RESET}`);

    for (const skillId of skillsToInstall) {
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
