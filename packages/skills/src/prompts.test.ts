import { describe, it, expect, vi } from "vitest";

import { BACK, promptConfirm, promptSelect, promptCheckbox } from "./prompts.js";

describe("promptConfirm", () => {
  it("should return true when isDefaultValue is true and stdin is not a TTY", async () => {
    const origIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = false as never;
    try {
      const result = await promptConfirm("Test message", { isDefaultValue: true });
      expect(result).toBe(true);
    } finally {
      process.stdin.isTTY = origIsTTY;
    }
  });

  it("should return false when isDefaultValue is false and stdin is not a TTY", async () => {
    const origIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = false as never;
    try {
      const result = await promptConfirm("Test message", { isDefaultValue: false });
      expect(result).toBe(false);
    } finally {
      process.stdin.isTTY = origIsTTY;
    }
  });
});

describe("promptSelect", () => {
  it("should return the choice at initialCursor when stdin is not a TTY", async () => {
    const origIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = false as never;
    try {
      const choices = [
        { name: "Choice A", value: "a" },
        { name: "Choice B", value: "b" },
      ];
      const result = await promptSelect("Test select", { choices });
      expect(result).toBe("a");
    } finally {
      process.stdin.isTTY = origIsTTY;
    }
  });

  it("should throw when choices is empty", () => {
    expect(() => promptSelect("Test", { choices: [] })).toThrow("selectPrompt: choices must not be empty");
  });

  it("should clamp initialCursor if it is out of bounds when stdin is not a TTY", async () => {
    const origIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = false as never;
    try {
      const choices = [
        { name: "Choice A", value: "a" },
        { name: "Choice B", value: "b" },
      ];
      const resultTooLarge = await promptSelect("Test select", { choices, initialCursor: 10 });
      expect(resultTooLarge).toBe("b");

      const resultNegative = await promptSelect("Test select", { choices, initialCursor: -5 });
      expect(resultNegative).toBe("a");
    } finally {
      process.stdin.isTTY = origIsTTY;
    }
  });

  it("should resolve BACK on backspace when canGoBack is true", async () => {
    const origIsTTY = process.stdin.isTTY;
    // setRawMode doesn't exist on non-TTY stdin in test environments.
    // Install a mock directly so runPrompt can call it.
    const origSetRawMode = (process.stdin as { setRawMode?: unknown }).setRawMode;
    Object.assign(process.stdin, { setRawMode: vi.fn().mockReturnValue(process.stdin) });
    process.stdin.isTTY = true as never;
    const pauseSpy = vi.spyOn(process.stdin, "pause").mockImplementation(() => process.stdin);
    const resumeSpy = vi.spyOn(process.stdin, "resume").mockImplementation(() => process.stdin);
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    try {
      const choices = [
        { name: "Choice A", value: "a" },
        { name: "Choice B", value: "b" },
      ];
      const promise = promptSelect("Test select", { choices, canGoBack: true });
      process.stdin.emit("keypress", undefined, { name: "backspace" });
      const result = await promise;
      expect(result).toBe(BACK);
    } finally {
      process.stdin.isTTY = origIsTTY;
      Object.assign(process.stdin, { setRawMode: origSetRawMode });
      pauseSpy.mockRestore();
      resumeSpy.mockRestore();
      writeSpy.mockRestore();
    }
  });
});

describe("promptCheckbox", () => {
  it("should return pre-checked values when stdin is not a TTY", async () => {
    const origIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = false as never;
    try {
      const choices = [
        { name: "A", value: "a", isChecked: true },
        { name: "B", value: "b", isChecked: false },
        { name: "C", value: "c", isChecked: true },
      ];
      const result = await promptCheckbox("Pick some", { choices });
      expect(result).toEqual(["a", "c"]);
    } finally {
      process.stdin.isTTY = origIsTTY;
    }
  });

  it("should return empty array when choices is empty and stdin is not a TTY", async () => {
    const origIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = false as never;
    try {
      const result = await promptCheckbox("Pick some", { choices: [] });
      expect(result).toEqual([]);
    } finally {
      process.stdin.isTTY = origIsTTY;
    }
  });
});
