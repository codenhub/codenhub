#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import {
  CODEX_IDENTIFIER,
  EXCLUDE_FOLDER_AGENTS,
  HARNESS_MAPPING,
  PromptExitError,
  clearScreen,
  drawHeader,
  drawSummary,
  type State,
} from "./cli-helpers.js";
import { createWizardSteps, getActiveSteps } from "./cli-steps.js";
import { getSkills, copyRecursiveSync } from "./index.js";
import { ANSI, BACK, CancelledError } from "./prompts.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILLS_SRC_DIR = path.resolve(__dirname, "../skills");

async function main() {
  const skills = getSkills(SKILLS_SRC_DIR);
  if (skills.length === 0) {
    console.error(`${ANSI.RED}Error: No skills found in source directory.${ANSI.RESET}`);
    process.exit(1);
  }

  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(
      `Usage: codenhub-skills [options]\n\n` +
        `Options:\n` +
        `  --local           Install skills to project workspace (default)\n` +
        `  --global          Install skills to user home directory\n` +
        `  --both            Install skills to both local and global harnesses\n` +
        `  --cleanup         Clean up target directories before installing\n` +
        `  --skills=<list>   Comma-separated list of skill IDs to install\n` +
        `  --all-skills      Install all available skills\n` +
        `  --harnesses=<list> Comma-separated list of harnesses to install to\n` +
        `  --all-harnesses   Install to all valid harnesses for the selected scope\n` +
        `  --help, -h        Display this help message`,
    );
    process.exit(0);
  }

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
    const steps = createWizardSteps(state, skills);
    let activeSteps = getActiveSteps(state, steps);
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

        const nextActiveSteps = getActiveSteps(state, steps);
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
        process.exit(130);
      }
      throw err;
    }

    clearScreen();
    drawHeader();
    drawSummary(activeSteps.length, activeSteps);
  } else {
    // Non-interactive mode (arguments parsed or stdin is not TTY)
    let scopeOption: string | undefined;
    let shouldCleanup: boolean | undefined;
    let harnessOptions: string[] | undefined;
    let shouldInstallAllHarnesses = false;
    let skillOptions: string[] | undefined;
    let shouldInstallAllSkills = false;

    for (const arg of args) {
      if (arg === "--global") {
        scopeOption = "global";
      } else if (arg === "--local") {
        scopeOption = "local";
      } else if (arg === "--both") {
        scopeOption = "both";
      } else if (arg === "--cleanup") {
        shouldCleanup = true;
      } else if (arg === "--all-harnesses") {
        shouldInstallAllHarnesses = true;
      } else if (arg === "--all-skills") {
        shouldInstallAllSkills = true;
      } else if (arg.startsWith("--harnesses=")) {
        harnessOptions = arg
          .slice("--harnesses=".length)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      } else if (arg.startsWith("--skills=")) {
        skillOptions = arg
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

    state.scope = scopeOption ?? "local";
    state.shouldCleanupFirst = shouldCleanup ?? false;

    // Resolve skills
    if (shouldInstallAllSkills || (!skillOptions && !hasArgs)) {
      state.shouldInstallAll = true;
      state.selectedSkills = skills.map((s) => s.id);
    } else if (skillOptions) {
      state.shouldInstallAll = false;
      state.selectedSkills = [];
      for (const id of skillOptions) {
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

    if (shouldInstallAllHarnesses) {
      state.selectedHarnesses = Object.keys(filteredHarnessMapping);
    } else if (harnessOptions) {
      state.selectedHarnesses = [];
      const keys = Object.keys(filteredHarnessMapping);
      for (const inputName of harnessOptions) {
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
    } else {
      const detectedHarnesses: string[] = [];
      for (const name of Object.keys(filteredHarnessMapping)) {
        const destBaseDir = filteredHarnessMapping[name];
        const isPathExisting = destBaseDir && (fs.existsSync(destBaseDir) || fs.existsSync(path.dirname(destBaseDir)));
        if (isPathExisting) {
          detectedHarnesses.push(name);
        }
      }
      if (detectedHarnesses.length === 0) {
        console.error(
          `${ANSI.RED}Error: No harnesses detected on the system for scope "${state.scope}". Use --all-harnesses or specify harnesses manually.${ANSI.RESET}`,
        );
        process.exit(1);
      }
      state.selectedHarnesses = detectedHarnesses;
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
