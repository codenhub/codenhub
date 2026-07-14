#!/usr/bin/env node
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";

import { getSkills, copyRecursiveSync } from "./index.js";
import {
  ANSI,
  BACK,
  CancelledError,
  promptCheckbox,
  promptConfirm,
  promptSelect,
  type BackSignal,
  type Choice,
  type SelectChoice,
} from "./prompts.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find skills directory relative to build output.
const SKILLS_SRC_DIR = path.resolve(__dirname, "../skills");

const HOME = os.homedir();

const HARNESS_MAPPING: Record<string, string> = {
  "Antigravity Global": path.join(HOME, ".gemini/config/skills"),
  "Antigravity Workspace": path.resolve("./.agents/skills"),
  "OpenCode Global": path.join(HOME, ".config/opencode/skills"),
  "OpenCode Workspace": path.resolve("./.opencode/skills"),
  "Claude Global": path.join(HOME, ".claude/skills"),
  "Claude Workspace": path.resolve("./.claude/skills"),
  "Codex Global": path.join(HOME, ".codex/skills"),
  "Codex Workspace": path.resolve("./.codex/skills"),
};

const CODEX_IDENTIFIER = "Codex";
const EXCLUDE_FOLDER_AGENTS = "agents";

/**
 * Thrown when the user makes a selection that has no valid items,
 * indicating the wizard should exit cleanly instead of continuing.
 */
class PromptExitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromptExitError";
  }
}

interface State {
  scope: string;
  shouldInstallAll: boolean;
  selectedSkills: string[];
  selectedHarnesses: string[];
  shouldCleanupFirst: boolean;
}

interface Step {
  id: string;
  title: string;
  /** Returns the human-readable summary for the completed-steps header. */
  summarize: () => string;
  run: (canGoBack: boolean) => Promise<boolean | BackSignal>;
}

async function main() {
  const skills = getSkills(SKILLS_SRC_DIR);
  if (skills.length === 0) {
    console.error(`${ANSI.RED}Error: No skills found in source directory.${ANSI.RESET}`);
    process.exit(1);
  }

  // Parse arguments
  const args = process.argv.slice(2);
  const hasArgs = args.length > 0;
  const isInteractive = process.stdin.isTTY && !hasArgs;

  const state: State = {
    scope: "local",
    shouldInstallAll: true,
    selectedSkills: skills.map((s) => s.id),
    selectedHarnesses: [],
    shouldCleanupFirst: false,
  };

  if (isInteractive) {
    const steps: Step[] = [
      {
        id: "scope",
        title: "Select Scope",
        summarize: () => {
          if (state.scope === "global") {
            return "Globally (user home directory)";
          }
          if (state.scope === "both") {
            return "Both";
          }
          return "Locally (project workspace)";
        },
        run: async (canGoBack) => {
          const scopeChoices: SelectChoice[] = [
            { name: "Locally (project workspace)", value: "local" },
            { name: "Globally (user home directory)", value: "global" },
            { name: "Both", value: "both" },
          ];
          const defaultIndex = scopeChoices.findIndex((c) => c.value === state.scope);
          const selected = await promptSelect("Where do you want to install the skills?", {
            choices: scopeChoices,
            initialCursor: defaultIndex !== -1 ? defaultIndex : 0,
            canGoBack,
          });
          if (selected === BACK) {
            return BACK;
          }
          state.scope = selected;
          return true;
        },
      },
      {
        id: "shouldInstallAll",
        title: "All Skills Option",
        summarize: () => (state.shouldInstallAll ? "Yes" : "No"),
        run: async (canGoBack) => {
          const selected = await promptConfirm("Do you want to install all available skills?", {
            defaultValue: state.shouldInstallAll,
            canGoBack,
          });
          if (selected === BACK) {
            return BACK;
          }
          state.shouldInstallAll = selected;
          return true;
        },
      },
      {
        id: "selectSkills",
        title: "Select Individual Skills",
        summarize: () => state.selectedSkills.join(", "),
        run: async (canGoBack) => {
          const skillChoices: Choice[] = skills.map((s) => ({
            name: s.name,
            value: s.id,
            checked: state.selectedSkills.includes(s.id),
            description: s.description,
          }));
          const selected = await promptCheckbox("Which skills do you want to install?", {
            choices: skillChoices,
            canGoBack,
          });
          if (selected === BACK) {
            return BACK;
          }
          if (selected.length === 0) {
            throw new PromptExitError("No skills selected. Exiting.");
          }
          state.selectedSkills = selected;
          return true;
        },
      },
      {
        id: "harnesses",
        title: "Select Harnesses",
        summarize: () => state.selectedHarnesses.join(", "),
        run: async (canGoBack) => {
          const filteredHarnessMapping: Record<string, string> = {};
          for (const name of Object.keys(HARNESS_MAPPING)) {
            const isGlobal = name.includes("Global");
            const isWorkspace = name.includes("Workspace");
            if (
              state.scope === "both" ||
              (state.scope === "global" && isGlobal) ||
              (state.scope === "local" && isWorkspace)
            ) {
              filteredHarnessMapping[name] = HARNESS_MAPPING[name];
            }
          }

          const harnessChoices: Choice[] = Object.keys(filteredHarnessMapping).map((name) => {
            const destBaseDir = filteredHarnessMapping[name];
            const pathExists = destBaseDir && (fs.existsSync(destBaseDir) || fs.existsSync(path.dirname(destBaseDir)));
            const defaultChecked = !!pathExists;

            return {
              name,
              value: name,
              checked: state.selectedHarnesses.length > 0 ? state.selectedHarnesses.includes(name) : defaultChecked,
              description: destBaseDir,
            };
          });

          const selected = await promptCheckbox("Which harnesses do you want to install to?", {
            choices: harnessChoices,
            canGoBack,
          });
          if (selected === BACK) {
            return BACK;
          }
          if (selected.length === 0) {
            throw new PromptExitError("No harnesses selected. Exiting.");
          }
          state.selectedHarnesses = selected;
          return true;
        },
      },
      {
        id: "cleanup",
        title: "Clean Up Option",
        summarize: () => (state.shouldCleanupFirst ? "Yes" : "No"),
        run: async (canGoBack) => {
          const selected = await promptConfirm(
            "Do you want to clean up target directories before installing (deleting all existing files/folders inside them)?",
            { defaultValue: state.shouldCleanupFirst, canGoBack },
          );
          if (selected === BACK) {
            return BACK;
          }
          state.shouldCleanupFirst = selected;
          return true;
        },
      },
    ];

    function getStepById(id: string): Step {
      const step = steps.find((s) => s.id === id);
      if (!step) {
        throw new Error(`Step "${id}" not found`);
      }
      return step;
    }

    function getActiveSteps(): Step[] {
      const active: Step[] = [getStepById("scope"), getStepById("shouldInstallAll")];
      if (!state.shouldInstallAll) {
        active.push(getStepById("selectSkills"));
      }
      active.push(getStepById("harnesses"), getStepById("cleanup"));
      return active;
    }

    function clearScreen() {
      process.stdout.write("\x1b[2J\x1b[H");
    }

    function drawHeader() {
      console.log(`${ANSI.BOLD}${ANSI.CYAN}=========================================${ANSI.RESET}`);
      console.log(`${ANSI.BOLD}${ANSI.CYAN}    Codenhub AI Agent Skills Installer${ANSI.RESET}`);
      console.log(`${ANSI.BOLD}${ANSI.CYAN}=========================================${ANSI.RESET}\n`);
    }

    function drawSummary(currentIdx: number, activeStepsList: Step[]) {
      for (let i = 0; i < currentIdx; i++) {
        const step = activeStepsList[i];
        console.log(`${ANSI.GREEN}✔${ANSI.RESET} ${ANSI.BOLD}${step.title}:${ANSI.RESET} ${step.summarize()}`);
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

    try {
      /* oxlint-disable no-await-in-loop */
      while (currentIdx < activeSteps.length) {
        clearScreen();
        drawHeader();
        drawSummary(currentIdx, activeSteps);

        const step = activeSteps[currentIdx];
        const canGoBack = currentIdx > 0;

        const isSuccess = await step.run(canGoBack);

        const nextActiveSteps = getActiveSteps();
        if (isSuccess === BACK) {
          const newIdx = nextActiveSteps.findIndex((s) => s.id === step.id);
          currentIdx = newIdx - 1;
        } else {
          const newIdx = nextActiveSteps.findIndex((s) => s.id === step.id);
          currentIdx = newIdx + 1;
        }
        activeSteps = nextActiveSteps;
      }
      /* oxlint-enable no-await-in-loop */
    } catch (err: unknown) {
      if (err instanceof PromptExitError) {
        console.log(`\n${ANSI.YELLOW}${err.message}${ANSI.RESET}`);
        process.exit(0);
      }
      if (err instanceof CancelledError) {
        console.log(`\n${ANSI.RED}Installation cancelled.${ANSI.RESET}`);
        process.exit(0);
      }
      throw err;
    }

    // Clear one last time and show the final completed summary.
    clearScreen();
    drawHeader();
    drawSummary(activeSteps.length, activeSteps);
  } else {
    // Non-interactive mode (arguments parsed or stdin is not TTY)
    let scopeArg: string | undefined;
    let cleanupArg: boolean | undefined;
    let harnessesArg: string[] | undefined;
    let allHarnessesArg = false;
    let skillsArg: string[] | undefined;
    let allSkillsArg = false;

    for (const arg of args) {
      if (arg === "--global") {
        scopeArg = "global";
      } else if (arg === "--local") {
        scopeArg = "local";
      } else if (arg === "--both") {
        scopeArg = "both";
      } else if (arg === "--cleanup") {
        cleanupArg = true;
      } else if (arg === "--all-harnesses") {
        allHarnessesArg = true;
      } else if (arg === "--all-skills") {
        allSkillsArg = true;
      } else if (arg.startsWith("--harnesses=")) {
        harnessesArg = arg
          .slice("--harnesses=".length)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      } else if (arg.startsWith("--skills=")) {
        skillsArg = arg
          .slice("--skills=".length)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      } else {
        console.error(`${ANSI.RED}Unknown argument: ${arg}${ANSI.RESET}`);
        console.error(
          `Usage: codenhub-skills [--local|--global|--both] [--cleanup] [--harnesses=...] [--all-harnesses] [--skills=...] [--all-skills]`,
        );
        process.exit(1);
      }
    }

    state.scope = scopeArg ?? "local";
    state.shouldCleanupFirst = cleanupArg ?? false;

    // Resolve skills
    if (allSkillsArg || (!skillsArg && !hasArgs)) {
      state.shouldInstallAll = true;
      state.selectedSkills = skills.map((s) => s.id);
    } else if (skillsArg) {
      state.shouldInstallAll = false;
      state.selectedSkills = [];
      for (const id of skillsArg) {
        if (skills.some((s) => s.id === id)) {
          state.selectedSkills.push(id);
        } else {
          console.error(`${ANSI.RED}Error: Skill "${id}" not found in source directory.${ANSI.RESET}`);
          process.exit(1);
        }
      }
    } else {
      state.shouldInstallAll = true;
      state.selectedSkills = skills.map((s) => s.id);
    }

    // Resolve harnesses based on scope
    const filteredHarnessMapping: Record<string, string> = {};
    for (const name of Object.keys(HARNESS_MAPPING)) {
      const isGlobal = name.includes("Global");
      const isWorkspace = name.includes("Workspace");
      if (
        state.scope === "both" ||
        (state.scope === "global" && isGlobal) ||
        (state.scope === "local" && isWorkspace)
      ) {
        filteredHarnessMapping[name] = HARNESS_MAPPING[name];
      }
    }

    if (allHarnessesArg) {
      state.selectedHarnesses = Object.keys(filteredHarnessMapping);
    } else if (harnessesArg) {
      state.selectedHarnesses = [];
      const keys = Object.keys(filteredHarnessMapping);
      for (const inputName of harnessesArg) {
        const matchedKey = keys.find((k) => k.toLowerCase() === inputName.toLowerCase());
        if (matchedKey) {
          state.selectedHarnesses.push(matchedKey);
        } else {
          console.error(
            `${ANSI.RED}Error: Harness "${inputName}" is not valid for scope "${state.scope}".${ANSI.RESET}`,
          );
          console.error(`Available for this scope: ${keys.join(", ")}`);
          process.exit(1);
        }
      }
    } else if (!hasArgs) {
      // Default: install locally only to existent folders, else fail.
      const detectedHarnesses: string[] = [];
      for (const name of Object.keys(filteredHarnessMapping)) {
        const destBaseDir = filteredHarnessMapping[name];
        const pathExists = destBaseDir && (fs.existsSync(destBaseDir) || fs.existsSync(path.dirname(destBaseDir)));
        if (pathExists) {
          detectedHarnesses.push(name);
        }
      }
      if (detectedHarnesses.length === 0) {
        console.error(
          `${ANSI.RED}Error: No harnesses detected on the system and no arguments were provided to force installation. Exiting.${ANSI.RESET}`,
        );
        process.exit(1);
      }
      state.selectedHarnesses = detectedHarnesses;
    } else {
      console.error(
        `${ANSI.RED}Error: No harnesses specified. Use --all-harnesses or --harnesses=<list>.${ANSI.RESET}`,
      );
      process.exit(1);
    }
  }

  const skillsToInstall = state.shouldInstallAll ? skills.map((s) => s.id) : state.selectedSkills;

  if (state.shouldCleanupFirst) {
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
    const isCodex = harness.includes(CODEX_IDENTIFIER);
    console.log(`${ANSI.BLUE}→ Installing to ${harness}...${ANSI.RESET}`);

    for (const skillId of skillsToInstall) {
      const skill = skills.find((s) => s.id === skillId);
      if (!skill) {
        continue;
      }

      const destSkillDir = path.join(destBaseDir, skillId);
      try {
        copyRecursiveSync({
          src: skill.path,
          dest: destSkillDir,
          ignoreList: isCodex ? [] : [EXCLUDE_FOLDER_AGENTS],
        });
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
  /* oxlint-disable-next-line promise/prefer-await-to-then */
  main().catch((err) => {
    console.error(`${ANSI.RED}Unhandled exception:${ANSI.RESET}`, err);
    process.exit(1);
  });
}
