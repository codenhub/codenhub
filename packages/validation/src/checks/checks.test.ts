import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { accepts, issuesOf } from "../test-utils";
import { endsWith } from "./ends-with";
import { includes } from "./includes";
import { lowercase } from "./lowercase";
import { multipleOf } from "./multiple-of";
import { nonZero } from "./non-zero";
import { pattern } from "./pattern";
import { startsWith } from "./starts-with";
import { uppercase } from "./uppercase";

describe("pattern", () => {
  it("should test the pattern, and ignore the g and y flags so answers do not depend on earlier calls", () => {
    const validator = string(pattern(/^a/g));
    expect([validator("ab").ok, validator("ab").ok, validator("ab").ok]).toEqual([true, true, true]);
    expect(string(pattern(/^a/y))("ab").ok).toBe(true);
  });

  it("should report the pattern it required", () => {
    expect(issuesOf(string(pattern(/^a$/))("b"))).toEqual([
      { code: "invalid_format", path: [], params: { format: "regex", pattern: "/^a$/" } },
    ]);
  });

  it("should refuse what is not a regular expression, and accept one from another realm", () => {
    expect(() => pattern("^a$" as never)).toThrow(new TypeError("pattern needs a RegExp, received string"));
    expect(() => pattern({ source: "^a$", flags: "" } as never)).toThrow(TypeError);
    expect(accepts(string(pattern(runInNewContext("/^a$/") as RegExp)), "a", "b")).toEqual([true, false]);
  });
});

describe("startsWith, endsWith and includes", () => {
  it("should check start, end and inclusion", () => {
    expect(accepts(string(startsWith("ab")), "abc", "bc")).toEqual([true, false]);
    expect(accepts(string(endsWith("bc")), "abc", "ab")).toEqual([true, false]);
    expect(accepts(string(includes("b")), "abc", "ac")).toEqual([true, false]);
  });

  it("should report what was required", () => {
    expect(issuesOf(string(startsWith("x"))("b"))[0]?.params).toEqual({ format: "startsWith", value: "x" });
    expect(issuesOf(string(endsWith("x"))("b"))[0]?.params).toEqual({ format: "endsWith", value: "x" });
    expect(issuesOf(string(includes("x"))("b"))[0]?.params).toEqual({ format: "includes", value: "x" });
  });
});

describe("lowercase and uppercase", () => {
  it("should require the case without changing the string, and pass a string with no letters", () => {
    expect(accepts(string(lowercase()), "abc", "aBc", "123")).toEqual([true, false, true]);
    expect(accepts(string(uppercase()), "ABC", "aBC", "123")).toEqual([true, false, true]);
  });

  it("should report the case it required", () => {
    expect(issuesOf(string(lowercase())("A"))).toEqual([
      { code: "invalid_format", path: [], params: { format: "lowercase" } },
    ]);
    expect(issuesOf(string(uppercase())("a"))[0]?.params).toEqual({ format: "uppercase" });
  });
});

describe("multipleOf", () => {
  it("should compare decimals as they are written", () => {
    expect(accepts(number(multipleOf(0.1)), 0.3, 1.2, 0.35)).toEqual([true, true, false]);
    expect(accepts(number(multipleOf(0.1)), 0.1 + 0.2)).toEqual([false]);
    expect(accepts(number(multipleOf(3)), 9, 1e21, 10)).toEqual([true, false, false]);
    expect(accepts(number(multipleOf(0.3)), 1e16)).toEqual([false]);
  });

  it("should report the step", () => {
    expect(issuesOf(number(multipleOf(5))(7))).toEqual([
      { code: "invalid_value", path: [], params: { type: "number", format: "multipleOf", value: 5 } },
    ]);
  });

  it("should refuse a step that is not a positive finite number", () => {
    for (const step of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => multipleOf(step)).toThrow(RangeError);
    }
  });
});

describe("nonZero", () => {
  it("should reject zero, of either sign", () => {
    expect(accepts(number(nonZero()), 1, -1, 0, -0)).toEqual([true, true, false, false]);
    expect(issuesOf(number(nonZero())(0))[0]?.params).toEqual({ type: "number", format: "nonZero" });
  });
});

describe("a built-in check", () => {
  it("should take a message as its last argument, as text or a function of the issue", () => {
    expect(issuesOf(string(startsWith("a", "Start with a"))("b"))[0]?.message).toBe("Start with a");
    const worded = string(pattern(/^a$/, (issue) => `Must match ${String(issue.params?.pattern)}`));
    expect(issuesOf(worded("b"))[0]?.message).toBe("Must match /^a$/");
  });

  it("should never put the value into its issue", () => {
    const secret = "hunter2";
    const all = string(pattern(/^\d+$/), startsWith("x"), endsWith("x"), includes("x"), uppercase());
    expect(JSON.stringify(issuesOf(all(secret)))).not.toContain(secret);
  });
});
