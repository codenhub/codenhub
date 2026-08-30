import * as fs from "fs";
import * as path from "path";

import { getHarnessesForScope, PromptExitError, type State, type Step } from "./cli-helpers.js";
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
        const scopedHarnesses = getHarnessesForScope(state.scope);

        const harnessChoices: Choice[] = scopedHarnesses.map((harness) => {
          const isPathExisting = fs.existsSync(harness.dest) || fs.existsSync(path.dirname(harness.dest));
          const isDefaultChecked = !!isPathExisting;

          return {
            name: harness.label,
            value: harness.label,
            isChecked:
              state.selectedHarnesses.length > 0 ? state.selectedHarnesses.includes(harness.label) : isDefaultChecked,
            description: harness.dest,
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
