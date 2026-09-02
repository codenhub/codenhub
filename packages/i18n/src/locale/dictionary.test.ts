// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { normalizeDictionary } from "./dictionary";

describe("normalizeDictionary", () => {
  it("flattens and freezes a dictionary without inherited properties", () => {
    const dictionary = normalizeDictionary({
      about: { title: "About us" },
      greeting: "Hello",
    });

    expect(dictionary).toEqual({ "about.title": "About us", greeting: "Hello" });
    expect(Object.getPrototypeOf(dictionary)).toBeNull();
    expect(Object.isFrozen(dictionary)).toBe(true);
    expect(() => Object.assign(dictionary, { greeting: "Changed" })).toThrow(TypeError);
  });

  it.each([
    ["null", null],
    ["array", ["value"]],
    ["empty object", {}],
    ["non-string leaf", { count: 1 }],
    ["function leaf", { callback: () => undefined }],
    ["array leaf", { values: ["value"] }],
    ["empty key", { "": "value" }],
    ["whitespace key", { "  ": "value" }],
  ])("rejects an invalid %s dictionary", (_name, input) => {
    expect(() => normalizeDictionary(input)).toThrow(TypeError);
  });

  it.each(["__proto__", "prototype", "constructor"])("rejects the dangerous key %s", (key) => {
    const input = Object.create(null) as Record<string, unknown>;
    input.safe = "value";
    input[key] = "danger";

    expect(() => normalizeDictionary(input)).toThrow(TypeError);
  });

  it.each(["safe.__proto__.key", "safe.prototype.key", "safe.constructor.key", ".key", "key.", "key..part"])(
    "rejects an invalid flattened key %s",
    (key) => {
      expect(() => normalizeDictionary({ [key]: "value" })).toThrow(TypeError);
    },
  );

  it.each([" key", "key ", "safe. child", "safe.child "])("rejects surrounding whitespace in flat key %s", (key) => {
    expect(() => normalizeDictionary({ [key]: "value" })).toThrow(TypeError);
  });

  it.each(["key\nforged", "key\u001bhidden", "key\u007fhidden"])(
    "rejects ASCII control characters in key %s",
    (key) => {
      expect(() => normalizeDictionary({ [key]: "value" })).toThrow("[I18n] Invalid locale dictionary key.");
    },
  );

  it("rejects surrounding whitespace in nested key segments", () => {
    expect(() => normalizeDictionary({ safe: { " child ": "value" } })).toThrow(TypeError);
  });

  it("rejects flattened-key collisions", () => {
    expect(() => normalizeDictionary({ "about.title": "Flat", about: { title: "Nested" } })).toThrow(TypeError);
  });

  it("rejects accessors without invoking them", () => {
    const getter = vi.fn(() => "value");
    const input = Object.defineProperty({}, "key", { enumerable: true, get: getter });

    expect(() => normalizeDictionary(input)).toThrow(TypeError);
    expect(getter).not.toHaveBeenCalled();
  });

  it("rejects symbol keys", () => {
    expect(() => normalizeDictionary({ key: "value", [Symbol("hidden")]: "value" })).toThrow(TypeError);
  });

  it("rejects cyclic dictionaries", () => {
    const input: Record<string, unknown> = { key: "value" };
    input.self = input;

    expect(() => normalizeDictionary(input)).toThrow(TypeError);
  });

  it("rejects shared object references before traversing them repeatedly", () => {
    const shared = { value: "translation" };

    expect(() => normalizeDictionary({ first: shared, second: shared })).toThrow("must not contain repeated objects");
  });

  it("rejects dictionaries deeper than 100 levels", () => {
    let input: Record<string, unknown> = { value: "translation" };

    for (let depth = 0; depth < 101; depth += 1) {
      input = { nested: input };
    }

    expect(() => normalizeDictionary(input)).toThrow("must not exceed 100 levels of nesting");
  });

  it("rejects dictionaries with more than 10,000 translations", () => {
    const input = Object.fromEntries(Array.from({ length: 10_001 }, (_, index) => [`key-${index}`, "value"]));

    expect(() => normalizeDictionary(input)).toThrow("must not exceed 10000 translations");
  });

  it("rejects dictionaries with more than 20,000 traversed properties", () => {
    const input = Object.fromEntries(Array.from({ length: 20_001 }, (_, index) => [`key-${index}`, {}]));

    expect(() => normalizeDictionary(input)).toThrow("must not exceed 20000 properties");
  });

  it("rejects flattened keys longer than 1,000 characters", () => {
    expect(() => normalizeDictionary({ ["k".repeat(1_001)]: "value" })).toThrow(
      "flattened keys must not exceed 1000 characters",
    );
  });

  it("rejects translation values longer than 100,000 characters", () => {
    expect(() => normalizeDictionary({ key: "v".repeat(100_001) })).toThrow(
      "translation values must not exceed 100000 characters",
    );
  });

  it("rejects dictionaries with more than 5,000,000 aggregate translation characters", () => {
    const input = Object.fromEntries(Array.from({ length: 51 }, (_, index) => [`key-${index}`, "v".repeat(100_000)]));

    expect(() => normalizeDictionary(input)).toThrow("must not exceed 5000000 aggregate translation characters");
  });
});
