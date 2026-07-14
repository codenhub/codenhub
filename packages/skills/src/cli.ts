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
  checkboxPrompt,
  confirmPrompt,
  selectPrompt,
  type BackSignal,
  type Choice,
  type SelectChoice,
} from "./prompts.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find skills directory relative to build output.
const skillsSrcDir = path.resolve(__dirname, "../skills");

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
  const skills = getSkills(skillsSrcDir);
  if (skills.length === 0) {
    console.error(`${ANSI.RED}Error: No skills found in source directory.${ANSI.RESET}`);
    process.exit(1);
  }

  const state: State = {
    scope: "local",
    shouldInstallAll: true,
    selectedSkills: skills.map((s) => s.id),
    selectedHarnesses: [],
    shouldCleanupFirst: false,
  };

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
        const selected = await selectPrompt("Where do you want to install the skills?", {
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
        const selected = await confirmPrompt("Do you want to install all available skills?", {
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
        const selected = await checkboxPrompt("Which skills do you want to install?", {
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

        const harnessChoices: Choice[] = Object.keys(filteredHarnessMapping).map((name) => ({
          name,
          value: name,
          checked: state.selectedHarnesses.length > 0 ? state.selectedHarnesses.includes(name) : true,
          description: filteredHarnessMapping[name],
        }));

        const selected = await checkboxPrompt("Which harnesses do you want to install to?", {
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
        const selected = await confirmPrompt(
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

  function stepById(id: string): Step {
    const step = steps.find((s) => s.id === id);
    if (!step) {
      throw new Error(`Step "${id}" not found`);
    }
    return step;
  }

  function getActiveSteps(): Step[] {
    const active: Step[] = [stepById("scope"), stepById("shouldInstallAll")];
    if (!state.shouldInstallAll) {
      active.push(stepById("selectSkills"));
    }
    active.push(stepById("harnesses"), stepById("cleanup"));
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
        copyRecursiveSync(skill.path, destSkillDir, {
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
