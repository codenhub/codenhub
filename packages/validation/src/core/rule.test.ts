import { describe, expect, it } from "vitest";

import { describe as describeCheck } from "./describe";
import { issue } from "./result";
import { assertMessage, rule, word } from "./rule";

describe("word", () => {
  it("should leave issues alone without a message", () => {
    expect(word([issue("a")], undefined)).toEqual([{ code: "a", path: [] }]);
  });

  it("should give each issue the text, or what a function words it as", () => {
    expect(word([issue("a"), issue("b")], "Bad")).toEqual([
      { code: "a", path: [], message: "Bad" },
      { code: "b", path: [], message: "Bad" },
    ]);
    expect(word([issue("a", { n: 1 })], (found) => `${found.code}${String(found.params?.n)}`)[0]?.message).toBe("a1");
  });

  it("should keep the wording an issue already has", () => {
    expect(word([{ code: "a", path: [], message: "Mine" }], "Bad")).toEqual([{ code: "a", path: [], message: "Mine" }]);
  });

  it("should throw when a function words an issue as something other than text", () => {
    expect(() => word([issue("a")], (() => undefined) as unknown as () => string)).toThrow(TypeError);
  });
});

describe("assertMessage", () => {
  it("should accept text, a function, and no wording", () => {
    expect(() => {
      assertMessage("Bad");
      assertMessage(() => "Bad");
      assertMessage(undefined);
    }).not.toThrow();
  });

  it.each([[null], [5], [{ en: "Bad" }]])("should throw for %j", (message) => {
    expect(() => assertMessage(message)).toThrow("message must be text or a function");
  });
});

describe("rule", () => {
  const even = rule<number>((value) => value % 2 === 0, "invalid_value", { even: true }, "Even please");

  it("should pass a value its test accepts and report any other, worded", () => {
    expect(even(2)).toBeUndefined();
    expect(even(3)).toEqual([{ code: "invalid_value", path: [], params: { even: true }, message: "Even please" }]);
  });

  it("should give each failure params of its own", () => {
    const [first] = even(3) as unknown as { params: Record<string, unknown> }[];
    (first as { params: Record<string, unknown> }).params["even"] = false;
    expect(even(3)?.[0]?.params).toEqual({ even: true });
  });

  it("should say what it is to a reader of the schema", () => {
    expect(describeCheck(even)).toEqual({ kind: "check", code: "invalid_value", params: { even: true } });
  });
});
