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
});
