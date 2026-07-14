import * as fs from "fs";
import * as path from "path";

import { PromptExitError, HARNESS_MAPPING, type State, type Step } from "./cli-helpers.js";
import { type Skill } from "./index.js";
import { BACK, promptCheckbox, promptConfirm, promptSelect, type Choice, type SelectChoice } from "./prompts.js";

export function createWizardSteps(state: State, skills: Skill[]): Step[] {
  return [
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
          isDefaultValue: state.shouldInstallAll,
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
          isChecked: state.selectedSkills.includes(s.id),
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
          const isPathExisting =
            destBaseDir && (fs.existsSync(destBaseDir) || fs.existsSync(path.dirname(destBaseDir)));
          const isDefaultChecked = !!isPathExisting;

          return {
            name,
            value: name,
            isChecked: state.selectedHarnesses.length > 0 ? state.selectedHarnesses.includes(name) : isDefaultChecked,
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
          { isDefaultValue: state.shouldCleanupFirst, canGoBack },
        );
        if (selected === BACK) {
          return BACK;
        }
        state.shouldCleanupFirst = selected;
        return true;
      },
    },
  ];
}

export function getActiveSteps(state: State, steps: Step[]): Step[] {
  function getStepById(id: string): Step {
    const step = steps.find((s) => s.id === id);
    if (!step) {
      throw new Error(`Step "${id}" not found`);
    }
    return step;
  }

  const active: Step[] = [getStepById("scope"), getStepById("shouldInstallAll")];
  if (!state.shouldInstallAll) {
    active.push(getStepById("selectSkills"));
  }
  active.push(getStepById("harnesses"), getStepById("cleanup"));
  return active;
}
