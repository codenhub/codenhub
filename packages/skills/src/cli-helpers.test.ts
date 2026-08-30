import * as os from "os";
import * as path from "path";

import type { MockInstance } from "vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  clearScreen,
  drawHeader,
  drawSummary,
  findHarnessByLabel,
  getHarnessesForScope,
  groupByDest,
  HARNESS_DESTINATIONS,
  PromptExitError,
  EXIT_CODE_CANCELLED,
  EXCLUDE_FOLDER_AGENTS,
} from "./cli-helpers.js";

describe("cli-helpers", () => {
  let logSpy: MockInstance;
  let writeSpy: MockInstance;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    logSpy.mockRestore();
    writeSpy.mockRestore();
  });

  it("should define exports correctly", () => {
    expect(EXIT_CODE_CANCELLED).toBe(130);
    expect(EXCLUDE_FOLDER_AGENTS).toBe("agents");
  });

  it("should have unique labels across all destinations", () => {
    const labels = HARNESS_DESTINATIONS.map((harness) => harness.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("should resolve global destinations under the home directory and workspace ones under cwd", () => {
    const home = os.homedir();
    const cwd = process.cwd();
    for (const harness of HARNESS_DESTINATIONS) {
      expect(path.isAbsolute(harness.dest)).toBe(true);
      const expectedPrefix = harness.scope === "global" ? home : cwd;
      expect(harness.dest.startsWith(expectedPrefix)).toBe(true);
    }
  });

  it("should filter harnesses by install scope", () => {
    const local = getHarnessesForScope("local");
    const global = getHarnessesForScope("global");
    const both = getHarnessesForScope("both");

    expect(local.every((harness) => harness.scope === "workspace")).toBe(true);
    expect(global.every((harness) => harness.scope === "global")).toBe(true);
    expect(both).toEqual(HARNESS_DESTINATIONS);
    expect(both.length).toBe(local.length + global.length);
  });

  it("should find harnesses by case-insensitive label within a scope", () => {
    expect(findHarnessByLabel("CLAUDE global", "global")?.dest).toBe(path.join(os.homedir(), ".claude/skills"));
    expect(findHarnessByLabel("Claude Global", "local")).toBeUndefined();
    expect(findHarnessByLabel("No Such Harness", "both")).toBeUndefined();
  });

  it("should install Codex into the Agent Skills standard locations with agents metadata", () => {
    for (const scope of ["workspace", "global"] as const) {
      const codex = HARNESS_DESTINATIONS.find(
        (harness) => harness.label === `Codex ${scope === "global" ? "Global" : "Workspace"}`,
      );
      const standard = HARNESS_DESTINATIONS.find(
        (harness) => harness.label === `Agent Skills ${scope === "global" ? "Global" : "Workspace"}`,
      );
      expect(codex).toBeDefined();
      expect(standard).toBeDefined();
      expect(codex?.dest).toBe(standard?.dest);
      expect(codex?.includeAgentsFolder).toBe(true);
      expect(standard?.includeAgentsFolder).toBeUndefined();
    }
  });

  it("should group selections sharing a destination into one copy", () => {
    const workspace = getHarnessesForScope("local");
    const groups = groupByDest([workspace[0], workspace[0]]);
    expect(groups).toHaveLength(1);
    expect(groups[0].labels).toEqual([workspace[0].label, workspace[0].label]);

    const codex = findHarnessByLabel("Codex Workspace", "local")!;
    const antigravity = findHarnessByLabel("Antigravity Workspace", "local")!;
    const claude = findHarnessByLabel("Claude Workspace", "local")!;

    const merged = groupByDest([codex, antigravity, claude]);
    expect(merged).toHaveLength(2);

    const shared = merged.find((group) => group.dest === codex.dest)!;
    expect(shared.labels).toEqual(["Codex Workspace", "Antigravity Workspace"]);
    expect(shared.includeAgentsFolder).toBe(true);

    const alone = merged.find((group) => group.dest === claude.dest)!;
    expect(alone.labels).toEqual(["Claude Workspace"]);
    expect(alone.includeAgentsFolder).toBe(false);
  });

  it("should preserve agents metadata when any Codex selection shares the destination", () => {
    const codex = findHarnessByLabel("Codex Global", "global")!;
    const standard = findHarnessByLabel("Agent Skills Global", "global")!;
    const groups = groupByDest([standard, codex]);
    expect(groups).toHaveLength(1);
    expect(groups[0].includeAgentsFolder).toBe(true);
  });

  it("should instantiate PromptExitError correctly", () => {
    const err = new PromptExitError("Custom error");
    expect(err.message).toBe("Custom error");
    expect(err.name).toBe("PromptExitError");
  });

  it("should clear screen", () => {
    clearScreen();
    expect(writeSpy).toHaveBeenCalledWith("\x1b[2J\x1b[H");
  });

  it("should draw header", () => {
    drawHeader();
    expect(logSpy).toHaveBeenCalled();
  });

  it("should draw summary for steps", () => {
    const mockSteps = [
      {
        id: "step-1",
        title: "Step One",
        summarize: () => "Summary One",
        run: async () => true,
      },
      {
        id: "step-2",
        title: "Step Two",
        summarize: () => "Summary Two",
        run: async () => true,
      },
    ];

    // Current index 1 (draws step 1 summary and step 2 header)
    drawSummary(1, mockSteps);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Step One"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Summary One"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Step Two"));
  });
});
