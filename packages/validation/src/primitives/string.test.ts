import { describe, expect, it } from "vitest";

import { check } from "../builders/check";
import { lowercase } from "../checks/lowercase";
import { pattern } from "../checks/pattern";
import { startsWith } from "../checks/starts-with";
import { accepts, codesOf, issuesOf, isPending, valueOf } from "../test-utils";
import { string } from "./string";

describe("string", () => {
  it("should accept any string, including the empty one, and return it", () => {
    expect(valueOf(string()(""))).toBe("");
    expect(valueOf(string()("text"))).toBe("text");
  });

  it("should reject everything that is not a string, naming the received type", () => {
    expect(accepts(string(), 1, null, undefined, {}, [], true, 1n)).toEqual(Array(7).fill(false));
    expect(issuesOf(string()(null))).toEqual([
      { code: "invalid_type", path: [], params: { expected: "string", received: "null" } },
    ]);
  });

  describe("length rules", () => {
    it("should treat min and max as inclusive", () => {
      expect(accepts(string({ min: 2 }), "a", "ab", "abc")).toEqual([false, true, true]);
      expect(accepts(string({ max: 2 }), "a", "ab", "abc")).toEqual([true, true, false]);
    });

    it("should require an exact length and report which side failed", () => {
      const exact = string({ length: 3 });
      expect(codesOf(exact("ab"))).toEqual(["too_small"]);
      expect(codesOf(exact("abcd"))).toEqual(["too_big"]);
      expect(exact("abc").ok).toBe(true);
      expect(issuesOf(exact("ab"))[0]?.params).toEqual({ minimum: 3, exact: true, type: "string" });
    });

    it("should carry the limit in params so messages can be built from it", () => {
      expect(issuesOf(string({ min: 3 })("a"))[0]?.params).toEqual({ minimum: 3, type: "string" });
      expect(issuesOf(string({ max: 1 })("ab"))[0]?.params).toEqual({ maximum: 1, type: "string" });
    });

    it("should count UTF-16 code units, as String.length does", () => {
      expect(string({ max: 1 })("😀").ok).toBe(false);
    });

    it("should reject a limit that is not a non-negative integer when the validator is created", () => {
      for (const options of [{ min: -1 }, { max: 1.5 }, { length: Number.NaN }]) {
        expect(() => string(options)).toThrow(RangeError);
      }
    });

    it("should reject a regular expression in place of its options, which would accept every string", () => {
      expect(() => string(/^a/ as never)).toThrow(TypeError);
    });

    it("should reject a limit that is not a number as a TypeError when the validator is created", () => {
      expect(() => string({ min: "3" as never })).toThrow(
        new TypeError("Minimum length must be a number, received string"),
      );
    });

    it("should reject limits no string can satisfy when the validator is created", () => {
      for (const options of [
        { min: 3, max: 2 },
        { min: 3, length: 2 },
        { max: 2, length: 3 },
      ]) {
        expect(() => string(options)).toThrow(RangeError);
      }
      expect(() => string({ min: 2, max: 2, length: 2 })).not.toThrow();
    });
  });

  describe("clean-up", () => {
    it("should trim, lowercase or uppercase the output", () => {
      expect(valueOf(string({ trim: true })("  a  "))).toBe("a");
      expect(valueOf(string({ case: "lower" })("AbC"))).toBe("abc");
      expect(valueOf(string({ case: "upper" })("AbC"))).toBe("ABC");
    });

    it("should run before the constraints, so they see the cleaned string", () => {
      expect(accepts(string({ trim: true, min: 3 }), "  ab  ", " abc ")).toEqual([false, true]);
      expect(accepts(string({ case: "lower" }, startsWith("a"), lowercase()), "ABC")).toEqual([true]);
      expect(string({ trim: true, min: 1 })("   ").ok).toBe(false);
    });

    it("should not touch the value when no clean-up is asked for", () => {
      expect(valueOf(string()("  Mixed Case  "))).toBe("  Mixed Case  ");
    });

    it("should refuse a case other than lower or upper when the validator is created", () => {
      expect(() => string({ case: "title" as never })).toThrow(TypeError);
    });
  });

  it("should report every check, in order, once its own constraints pass", () => {
    const strict = string({ min: 2 }, pattern(/^\d+$/), startsWith("9"));
    expect(issuesOf(strict("ab")).map((issue) => issue.params?.format ?? issue.code)).toEqual(["regex", "startsWith"]);
  });

  it("should run no check while one of its own constraints fails", () => {
    const strict = string({ min: 5 }, pattern(/^\d+$/), startsWith("9"));
    expect(codesOf(strict("ab"))).toEqual(["too_small"]);
  });

  it("should keep a long string from its checks with max", () => {
    let calls = 0;
    const capped = string(
      { max: 10 },
      check(() => {
        calls += 1;
        return true;
      }),
    );
    expect(codesOf(capped("x".repeat(1_000_000)))).toEqual(["too_big"]);
    expect(calls).toBe(0);
  });

  it("should answer at once, without running an asynchronous check, while a constraint fails", async () => {
    let calls = 0;
    const taken = string(
      { min: 3 },
      check(async () => {
        calls += 1;
        return true;
      }),
    );
    expect(isPending(taken("ab"))).toBe(false);
    expect(codesOf(await taken("ab"))).toEqual(["too_small"]);
    expect(calls).toBe(0);
  });

  it("should word its own issues with message, and leave each check's to the check", () => {
    const named = string({ min: 2, message: "Too short" }, startsWith("9", "Start with 9"));
    expect(issuesOf(named("a")).map((issue) => issue.message)).toEqual(["Too short"]);
    expect(issuesOf(named("ab")).map((issue) => issue.message)).toEqual(["Start with 9"]);
    expect(issuesOf(string({ message: "Text please" })(1))[0]?.message).toBe("Text please");
  });

  it("should take checks without options", () => {
    expect(accepts(string(startsWith("a")), "ab", "b")).toEqual([true, false]);
  });

  it("should never put the received value into an issue", () => {
    const secret = "hunter2";
    expect(JSON.stringify(issuesOf(string({ min: 20 }, pattern(/^\d+$/))(secret)))).not.toContain(secret);
  });

  it("should give the same answer on every call", () => {
    const validator = string({ min: 2 });
    expect([validator("ab"), validator("ab")]).toEqual([validator("ab"), validator("ab")]);
  });
});
