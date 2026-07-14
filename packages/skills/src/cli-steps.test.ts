import { describe, it, expect } from "vitest";

import type { State } from "./cli-helpers.js";
import { createWizardSteps, getActiveSteps } from "./cli-steps.js";
import type { Skill } from "./index.js";

describe("cli-steps", () => {
  const dummySkills: Skill[] = [
    { id: "skill-a", name: "Skill A", description: "Desc A", path: "/a" },
    { id: "skill-b", name: "Skill B", description: "Desc B", path: "/b" },
  ];

  it("should create wizard steps with correct properties", () => {
    const state: State = {
      scope: "local",
      shouldInstallAll: true,
      selectedSkills: [],
      selectedHarnesses: [],
      shouldCleanupFirst: false,
    };
    const steps = createWizardSteps(state, dummySkills);
    expect(steps).toBeInstanceOf(Array);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.find((s) => s.id === "scope")).toBeDefined();
  });

  it("should determine active steps based on state.shouldInstallAll", () => {
    const state: State = {
      scope: "local",
      shouldInstallAll: true,
      selectedSkills: [],
      selectedHarnesses: [],
      shouldCleanupFirst: false,
    };
    const steps = createWizardSteps(state, dummySkills);

    // When shouldInstallAll is true, selectSkills should not be active
    const activeWhenAll = getActiveSteps(state, steps);
    expect(activeWhenAll.some((s) => s.id === "selectSkills")).toBe(false);
    expect(activeWhenAll.map((s) => s.id)).toEqual(["scope", "shouldInstallAll", "harnesses", "cleanup"]);

    // When shouldInstallAll is false, selectSkills should be active
    state.shouldInstallAll = false;
    const activeWhenNotAll = getActiveSteps(state, steps);
    expect(activeWhenNotAll.some((s) => s.id === "selectSkills")).toBe(true);
    expect(activeWhenNotAll.map((s) => s.id)).toEqual([
      "scope",
      "shouldInstallAll",
      "selectSkills",
      "harnesses",
      "cleanup",
    ]);
  });

  it("should summarize correctly based on state values", () => {
    const state: State = {
      scope: "local",
      shouldInstallAll: true,
      selectedSkills: ["skill-a"],
      selectedHarnesses: ["Antigravity Workspace"],
      shouldCleanupFirst: false,
    };
    const steps = createWizardSteps(state, dummySkills);

    const scopeStep = steps.find((s) => s.id === "scope")!;
    expect(scopeStep.summarize()).toBe("Locally (project workspace)");

    state.scope = "global";
    expect(scopeStep.summarize()).toBe("Globally (user home directory)");

    state.scope = "both";
    expect(scopeStep.summarize()).toBe("Both");

    const allSkillsStep = steps.find((s) => s.id === "shouldInstallAll")!;
    expect(allSkillsStep.summarize()).toBe("Yes");

    state.shouldInstallAll = false;
    expect(allSkillsStep.summarize()).toBe("No");

    const selectSkillsStep = steps.find((s) => s.id === "selectSkills")!;
    expect(selectSkillsStep.summarize()).toBe("skill-a");

    const cleanupStep = steps.find((s) => s.id === "cleanup")!;
    expect(cleanupStep.summarize()).toBe("No");
  });
});
