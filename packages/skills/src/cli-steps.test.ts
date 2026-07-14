import { describe, it, expect, vi } from "vitest";

import type { State } from "./cli-helpers.js";
import { createWizardSteps, getActiveSteps } from "./cli-steps.js";
import type { Skill } from "./index.js";
import { BACK } from "./prompts.js";
import type * as promptsType from "./prompts.js";

vi.mock("./prompts.js", async (importOriginal) => {
  const mod = await importOriginal<typeof promptsType>();
  return {
    ...mod,
    promptSelect: vi.fn(),
    promptConfirm: vi.fn(),
    promptCheckbox: vi.fn(),
  };
});

import { promptSelect, promptConfirm, promptCheckbox } from "./prompts.js";

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

    const activeWhenAll = getActiveSteps(state, steps);
    expect(activeWhenAll.some((s) => s.id === "selectSkills")).toBe(false);
    expect(activeWhenAll.map((s) => s.id)).toEqual(["scope", "shouldInstallAll", "harnesses", "cleanup"]);

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

  describe("run steps", () => {
    it("should run scope step successfully", async () => {
      const state: State = {
        scope: "local",
        shouldInstallAll: true,
        selectedSkills: [],
        selectedHarnesses: [],
        shouldCleanupFirst: false,
      };
      const steps = createWizardSteps(state, dummySkills);
      const scopeStep = steps.find((s) => s.id === "scope")!;

      vi.mocked(promptSelect).mockResolvedValue("global");
      const res = await scopeStep.run(false);
      expect(res).toBe(true);
      expect(state.scope).toBe("global");

      vi.mocked(promptSelect).mockResolvedValue(BACK);
      const resBack = await scopeStep.run(true);
      expect(resBack).toBe(BACK);
    });

    it("should run shouldInstallAll step successfully", async () => {
      const state: State = {
        scope: "local",
        shouldInstallAll: true,
        selectedSkills: [],
        selectedHarnesses: [],
        shouldCleanupFirst: false,
      };
      const steps = createWizardSteps(state, dummySkills);
      const allSkillsStep = steps.find((s) => s.id === "shouldInstallAll")!;

      vi.mocked(promptConfirm).mockResolvedValue(false);
      const res = await allSkillsStep.run(true);
      expect(res).toBe(true);
      expect(state.shouldInstallAll).toBe(false);

      vi.mocked(promptConfirm).mockResolvedValue(BACK);
      const resBack = await allSkillsStep.run(true);
      expect(resBack).toBe(BACK);
    });

    it("should run selectSkills step successfully", async () => {
      const state: State = {
        scope: "local",
        shouldInstallAll: false,
        selectedSkills: [],
        selectedHarnesses: [],
        shouldCleanupFirst: false,
      };
      const steps = createWizardSteps(state, dummySkills);
      const selectSkillsStep = steps.find((s) => s.id === "selectSkills")!;

      vi.mocked(promptCheckbox).mockResolvedValue(["skill-b"]);
      const res = await selectSkillsStep.run(true);
      expect(res).toBe(true);
      expect(state.selectedSkills).toEqual(["skill-b"]);

      vi.mocked(promptCheckbox).mockResolvedValue(BACK);
      const resBack = await selectSkillsStep.run(true);
      expect(resBack).toBe(BACK);

      vi.mocked(promptCheckbox).mockResolvedValue([]);
      await expect(selectSkillsStep.run(true)).rejects.toThrow("No skills selected");
    });

    it("should run harnesses step successfully", async () => {
      const state: State = {
        scope: "local",
        shouldInstallAll: true,
        selectedSkills: [],
        selectedHarnesses: [],
        shouldCleanupFirst: false,
      };
      const steps = createWizardSteps(state, dummySkills);
      const harnessesStep = steps.find((s) => s.id === "harnesses")!;

      vi.mocked(promptCheckbox).mockResolvedValue(["Antigravity Workspace"]);
      const res = await harnessesStep.run(true);
      expect(res).toBe(true);
      expect(state.selectedHarnesses).toEqual(["Antigravity Workspace"]);

      vi.mocked(promptCheckbox).mockResolvedValue(BACK);
      const resBack = await harnessesStep.run(true);
      expect(resBack).toBe(BACK);

      vi.mocked(promptCheckbox).mockResolvedValue([]);
      await expect(harnessesStep.run(true)).rejects.toThrow("No harnesses selected");
    });

    it("should run cleanup step successfully", async () => {
      const state: State = {
        scope: "local",
        shouldInstallAll: true,
        selectedSkills: [],
        selectedHarnesses: [],
        shouldCleanupFirst: false,
      };
      const steps = createWizardSteps(state, dummySkills);
      const cleanupStep = steps.find((s) => s.id === "cleanup")!;

      vi.mocked(promptConfirm).mockResolvedValue(true);
      const res = await cleanupStep.run(true);
      expect(res).toBe(true);
      expect(state.shouldCleanupFirst).toBe(true);

      vi.mocked(promptConfirm).mockResolvedValue(BACK);
      const resBack = await cleanupStep.run(true);
      expect(resBack).toBe(BACK);
    });
  });
});
