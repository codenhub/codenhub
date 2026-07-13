import { describe, expect, it } from "vitest";

import { createErrorRegistry } from "./index";

describe("feedback map bucket (codes / names / messages)", () => {
  it("should store and retrieve an entry by identifier", () => {
    const registry = createErrorRegistry();
    registry.codes.add("invalid_credentials", { message: "Invalid email or password." });
    expect(registry.codes.get("invalid_credentials")).toEqual({ message: "Invalid email or password." });
  });

  it("should normalize identifiers by trimming whitespace and stripping trailing punctuation", () => {
    const registry = createErrorRegistry();
    registry.codes.add(" invalid_credentials. ", { message: "Invalid email or password." });
    expect(registry.codes.get("invalid_credentials")).toEqual({ message: "Invalid email or password." });
  });

  it("should return a defensive copy from get so external mutation does not affect stored state", () => {
    const registry = createErrorRegistry();
    registry.codes.add("code1", { message: "Msg" });
    const copy = registry.codes.get("code1")!;
    copy.message = "mutated";
    expect(registry.codes.get("code1")!.message).toBe("Msg");
  });

  it("should return defensive copies from values so external mutation does not affect stored state", () => {
    const registry = createErrorRegistry();
    registry.codes.add("code1", { message: "Msg" });
    const [[, copy]] = [...registry.codes.values()];
    copy.message = "mutated";
    expect(registry.codes.get("code1")!.message).toBe("Msg");
  });

  it("should add multiple entries with addList", () => {
    const registry = createErrorRegistry();
    registry.codes.addList([
      ["code_one", { message: "One" }],
      ["code_two", { message: "Two" }],
    ]);
    expect(registry.codes.get("code_one")).toEqual({ message: "One" });
    expect(registry.codes.get("code_two")).toEqual({ message: "Two" });
  });

  it("should keep addList callable when destructured", () => {
    const registry = createErrorRegistry();
    const { addList } = registry.codes;
    addList([["code_one", { message: "One" }]]);
    expect(registry.codes.get("code_one")).toEqual({ message: "One" });
  });

  it("should overwrite an existing entry on add", () => {
    const registry = createErrorRegistry();
    registry.codes.add("code1", { message: "First" });
    registry.codes.add("code1", { message: "Second" });
    expect(registry.codes.get("code1")).toEqual({ message: "Second" });
  });

  it("should delete an entry and return true, then false on repeated delete", () => {
    const registry = createErrorRegistry();
    registry.codes.add("code1", { message: "Msg" });
    expect(registry.codes.delete("code1")).toBe(true);
    expect(registry.codes.get("code1")).toBeUndefined();
    expect(registry.codes.delete("code1")).toBe(false);
  });

  it("should clear all entries", () => {
    const registry = createErrorRegistry();
    registry.codes.add("code1", { message: "Msg" });
    registry.codes.clear();
    expect(registry.codes.get("code1")).toBeUndefined();
  });

  it("should reject an empty or whitespace-only identifier", () => {
    const registry = createErrorRegistry();
    expect(() => registry.codes.add("   ", { message: "Msg" })).toThrow(TypeError);
  });

  it("should reject feedback without a non-empty message", () => {
    const registry = createErrorRegistry();
    expect(() => registry.codes.add("code1", {} as never)).toThrow(TypeError);
  });

  it("should reject feedback with invalid optional field types", () => {
    const registry = createErrorRegistry();
    expect(() => registry.codes.add("code1", null as never)).toThrow(TypeError);
    expect(() => registry.codes.add("code1", { message: "Msg", messageKey: 123 } as never)).toThrow(TypeError);
    expect(() => registry.codes.add("code1", { message: "Msg", source: 123 } as never)).toThrow(TypeError);
    expect(() => registry.codes.add("code1", { message: "Msg", isRetryable: "yes" } as never)).toThrow(TypeError);
  });

  it("should reject an empty or whitespace-only identifier on delete", () => {
    const registry = createErrorRegistry();
    expect(() => registry.codes.delete("   ")).toThrow(TypeError);
  });
});

describe("prefix bucket", () => {
  it("should store a prefix entry and expose it via values", () => {
    const registry = createErrorRegistry();
    registry.prefixes.add("Upload failed:", { message: "Upload failed." });
    const values = registry.prefixes.values();
    expect(values).toHaveLength(1);
    expect(values[0]).toMatchObject({ prefix: "Upload failed:", message: "Upload failed." });
  });

  it("should overwrite a duplicate prefix on add", () => {
    const registry = createErrorRegistry();
    registry.prefixes.add("Upload failed:", { message: "First" });
    registry.prefixes.add("Upload failed:", { message: "Second" });
    const values = registry.prefixes.values();
    expect(values).toHaveLength(1);
    expect(values[0]).toMatchObject({ prefix: "Upload failed:", message: "Second" });
  });

  it("should add multiple prefix entries with addList", () => {
    const registry = createErrorRegistry();
    registry.prefixes.addList([
      ["First prefix:", { message: "First" }],
      ["Second prefix:", { message: "Second" }],
    ]);
    expect(registry.prefixes.values()).toHaveLength(2);
  });

  it("should delete a prefix and return true, then false on repeated delete", () => {
    const registry = createErrorRegistry();
    registry.prefixes.add("Upload failed:", { message: "Msg" });
    expect(registry.prefixes.delete("Upload failed:")).toBe(true);
    expect(registry.prefixes.values()).toHaveLength(0);
    expect(registry.prefixes.delete("Upload failed:")).toBe(false);
  });

  it("should clear all prefix entries", () => {
    const registry = createErrorRegistry();
    registry.prefixes.add("Upload failed:", { message: "Msg" });
    registry.prefixes.clear();
    expect(registry.prefixes.values()).toHaveLength(0);
  });

  it("should reject a prefix that normalizes to an empty string", () => {
    const registry = createErrorRegistry();
    expect(() => registry.prefixes.add("!!!", { message: "Msg" })).toThrow(TypeError);
  });
});

describe("pattern bucket", () => {
  it("should store and match a pattern via values", () => {
    const registry = createErrorRegistry();
    registry.patterns.add(/network error/i, { message: "Network error." });
    const values = registry.patterns.values();
    expect(values).toHaveLength(1);
    expect(values[0].pattern.test("network error occurred")).toBe(true);
  });

  it("should overwrite a duplicate pattern on add", () => {
    const registry = createErrorRegistry();
    registry.patterns.add(/network error/i, { message: "First" });
    registry.patterns.add(/network error/i, { message: "Second" });
    const values = registry.patterns.values();
    expect(values).toHaveLength(1);
    expect(values[0]).toMatchObject({ message: "Second" });
  });

  it("should add multiple patterns with addList", () => {
    const registry = createErrorRegistry();
    registry.patterns.addList([
      [/network/i, { message: "Network" }],
      [/timeout/i, { message: "Timeout" }],
    ]);
    expect(registry.patterns.values()).toHaveLength(2);
  });

  it("should strip global and sticky flags to prevent stateful lastIndex drift", () => {
    const registry = createErrorRegistry();
    registry.patterns.add(/test-error/g, { message: "Test error" });
    const [stored] = registry.patterns.values();
    expect(stored.pattern.flags).not.toContain("g");
  });

  it("should return cloned RegExp instances from values to prevent shared lastIndex", () => {
    const registry = createErrorRegistry();
    registry.patterns.add(/test/i, { message: "Test" });
    const [first] = registry.patterns.values();
    const [second] = registry.patterns.values();
    expect(first.pattern).not.toBe(second.pattern);
  });

  it("should delete a pattern by reference (matching source and flags) and return true, then false", () => {
    const registry = createErrorRegistry();
    const pattern = /network/i;
    registry.patterns.add(pattern, { message: "Network" });
    expect(registry.patterns.delete(pattern)).toBe(true);
    expect(registry.patterns.values()).toHaveLength(0);
    expect(registry.patterns.delete(pattern)).toBe(false);
  });

  it("should match delete when input pattern has global/sticky flag stripped", () => {
    const registry = createErrorRegistry();
    registry.patterns.add(/test-error/g, { message: "Test" });
    expect(registry.patterns.delete(/test-error/g)).toBe(true);
    expect(registry.patterns.values()).toHaveLength(0);
  });

  it("should clear all patterns", () => {
    const registry = createErrorRegistry();
    registry.patterns.add(/err/i, { message: "Error" });
    registry.patterns.clear();
    expect(registry.patterns.values()).toHaveLength(0);
  });

  it("should reject a non-RegExp pattern on add", () => {
    const registry = createErrorRegistry();
    expect(() => registry.patterns.add("failed to fetch" as never, { message: "Msg" })).toThrow(TypeError);
  });

  it("should reject a non-RegExp pattern on delete", () => {
    const registry = createErrorRegistry();
    expect(() => registry.patterns.delete("not-a-regex" as unknown as RegExp)).toThrow(TypeError);
  });
});
