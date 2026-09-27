#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import {
  EXCLUDE_FOLDER_AGENTS,
  findHarnessByLabel,
  getHarnessesForScope,
  groupByDest,
  INCLUDE_DRAFTS_FLAG,
  loadSkills,
  PromptExitError,
  EXIT_CODE_CANCELLED,
  clearScreen,
  drawHeader,
  drawSummary,
  type State,
} from "./cli-helpers.js";
import { createWizardSteps, getActiveSteps } from "./cli-steps.js";
import { copyRecursiveSync, type Skill } from "./index.js";
import { ANSI, BACK, CancelledError } from "./prompts.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILLS_SRC_DIR = path.resolve(__dirname, "../skills");
const DRAFTS_SRC_DIR = path.resolve(__dirname, "../drafts");

async function main() {
  const argv = process.argv.slice(2);
  // Says where skills come from, not what to install, so it keeps the wizard.
  const shouldIncludeDrafts = argv.includes(INCLUDE_DRAFTS_FLAG);
  const args = argv.filter((arg) => arg !== INCLUDE_DRAFTS_FLAG);

  let skills: Skill[];
  try {
    skills = loadSkills(SKILLS_SRC_DIR, DRAFTS_SRC_DIR, shouldIncludeDrafts);
  } catch (err: unknown) {
    console.error(`${ANSI.RED}Error: ${err instanceof Error ? err.message : String(err)}${ANSI.RESET}`);
    process.exit(1);
  }
  if (skills.length === 0) {
    console.error(`${ANSI.RED}Error: No skills found in source directory.${ANSI.RESET}`);
    process.exit(1);
  }

  if (args.includes("--help") || args.includes("-h")) {
    console.log(
      `Usage: codenhub-skills [options]\n\n` +
        `Options:\n` +
        `  --local           Install skills to project workspace (default)\n` +
        `  --global          Install skills to user home directory\n` +
        `  --both            Install skills to both local and global harnesses\n` +
        `  --cleanup         Clean up target directories before installing (deletes ALL existing files/folders inside them)\n` +
        `  --skills=<list>   Comma-separated list of skill IDs to install\n` +
        `  --all-skills      Install all available skills\n` +
        `  --harnesses=<list> Comma-separated list of harnesses to install to\n` +
        `  --all-harnesses   Install to all valid harnesses for the selected scope\n` +
        `  --include-drafts  Also offer the draft skills (repository checkout only)\n` +
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
        process.exit(EXIT_CODE_CANCELLED);
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
        const rawList = arg.slice("--harnesses=".length).trim();
        if (rawList === "") {
          console.error(`${ANSI.RED}Error: --harnesses requires a non-empty list of harnesses.${ANSI.RESET}`);
          process.exit(1);
        }
        harnessOptions = Array.from(
          new Set(
            rawList
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          ),
        );
        if (harnessOptions.length === 0) {
          console.error(`${ANSI.RED}Error: --harnesses requires a non-empty list of harnesses.${ANSI.RESET}`);
          process.exit(1);
        }
      } else if (arg.startsWith("--skills=")) {
        const rawList = arg.slice("--skills=".length).trim();
        if (rawList === "") {
          console.error(`${ANSI.RED}Error: --skills requires a non-empty list of skill IDs.${ANSI.RESET}`);
          process.exit(1);
        }
        skillOptions = Array.from(
          new Set(
            rawList
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          ),
        );
        if (skillOptions.length === 0) {
          console.error(`${ANSI.RED}Error: --skills requires a non-empty list of skill IDs.${ANSI.RESET}`);
          process.exit(1);
        }
      } else {
        console.error(`${ANSI.RED}Unknown argument: ${arg}${ANSI.RESET}`);
        console.error(
          `Usage: codenhub-skills [--local|--global|--both] [--cleanup] [--harnesses=...] [--all-harnesses] [--skills=...] [--all-skills] [--include-drafts]`,
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
    const scopedHarnesses = getHarnessesForScope(state.scope);

    if (shouldInstallAllHarnesses) {
      state.selectedHarnesses = scopedHarnesses.map((harness) => harness.label);
    } else if (harnessOptions) {
      state.selectedHarnesses = [];
      for (const inputName of harnessOptions) {
        const harness = findHarnessByLabel(inputName, state.scope);
        if (harness) {
          state.selectedHarnesses.push(harness.label);
        } else {
          console.error(
            `${ANSI.RED}Error: Harness "${inputName}" is not valid for scope "${state.scope}".${ANSI.RESET}`,
          );
          console.error(`Available for this scope: ${scopedHarnesses.map((h) => h.label).join(", ")}`);
          process.exit(1);
        }
      }
    } else {
      const detectedHarnesses: string[] = [];
      for (const harness of scopedHarnesses) {
        const isPathExisting = fs.existsSync(harness.dest) || fs.existsSync(path.dirname(harness.dest));
        if (isPathExisting) {
          detectedHarnesses.push(harness.label);
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

  // Harnesses that read the same directory share one copy (and one cleanup).
  const destinationGroups = groupByDest(
    state.selectedHarnesses
      .map((label) => findHarnessByLabel(label, state.scope))
      .filter((harness) => harness !== undefined),
  );

  if (state.shouldCleanupFirst) {
    console.log(`${ANSI.YELLOW}Cleaning up target directories...${ANSI.RESET}`);
    for (const group of destinationGroups) {
      if (fs.existsSync(group.dest)) {
        try {
          fs.rmSync(group.dest, { recursive: true, force: true });
          console.log(`  ${ANSI.GREEN}✔${ANSI.RESET} Cleaned: ${group.dest}`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`  ${ANSI.RED}✘${ANSI.RESET} Failed cleaning ${group.dest}: ${msg}`);
        }
      }
    }
    console.log("");
  }

  console.log(`${ANSI.BOLD}Installing skills...${ANSI.RESET}\n`);

  let hasFailures = false;

  for (const group of destinationGroups) {
    console.log(`${ANSI.BLUE}→ Installing to ${group.labels.join(", ")}...${ANSI.RESET}`);

    for (const skillId of skillsToInstall) {
      const skill = skills.find((s) => s.id === skillId);
      if (!skill) {
        continue;
      }

      const destSkillDir = path.join(group.dest, skillId);
      try {
        copyRecursiveSync({
          src: skill.path,
          dest: destSkillDir,
          ignoreList: group.includeAgentsFolder ? [] : [EXCLUDE_FOLDER_AGENTS],
        });
        console.log(`  ${ANSI.GREEN}✔${ANSI.RESET} Copied: ${skill.name}`);
      } catch (err: unknown) {
        hasFailures = true;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ${ANSI.RED}✘${ANSI.RESET} Failed copying ${skill.name}: ${msg}`);
      }
    }
  }

  if (hasFailures) {
    console.error(`\n${ANSI.RED}${ANSI.BOLD}✘ Some skills failed to install. Check the output above.${ANSI.RESET}\n`);
    process.exit(1);
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
