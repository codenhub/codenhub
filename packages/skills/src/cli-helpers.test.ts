import type { MockInstance } from "vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  clearScreen,
  drawHeader,
  drawSummary,
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
