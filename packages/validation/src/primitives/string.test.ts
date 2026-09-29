import { describe, expect, it } from "vitest";

import { accepts, codesOf, issuesOf, valueOf } from "../test-utils";
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

  describe("pattern and substring rules", () => {
    it("should test the pattern, and ignore the g and y flags so answers do not depend on earlier calls", () => {
      const validator = string({ pattern: /^a/g });
      expect([validator("ab").ok, validator("ab").ok, validator("ab").ok]).toEqual([true, true, true]);
      expect(string({ pattern: /^a/y })("ab").ok).toBe(true);
    });

    it("should check start, end and inclusion", () => {
      expect(accepts(string({ startsWith: "ab" }), "abc", "bc")).toEqual([true, false]);
      expect(accepts(string({ endsWith: "bc" }), "abc", "ab")).toEqual([true, false]);
      expect(accepts(string({ includes: "b" }), "abc", "ac")).toEqual([true, false]);
    });

    it("should report format, with what was required, for a failed pattern or substring rule", () => {
      expect(issuesOf(string({ pattern: /^a$/ })("b"))[0]).toEqual({
        code: "invalid_format",
        path: [],
        params: { format: "regex", pattern: "/^a$/" },
      });
      expect(issuesOf(string({ startsWith: "x" })("b"))[0]?.params).toEqual({ format: "startsWith", value: "x" });
    });
  });

  describe("clean-up", () => {
    it("should trim, lowercase or uppercase the output", () => {
      expect(valueOf(string({ trim: true })("  a  "))).toBe("a");
      expect(valueOf(string({ lowercase: true })("AbC"))).toBe("abc");
      expect(valueOf(string({ uppercase: true })("AbC"))).toBe("ABC");
    });

    it("should run before the constraints, so they see the cleaned string", () => {
      expect(accepts(string({ trim: true, min: 3 }), "  ab  ", " abc ")).toEqual([false, true]);
      expect(accepts(string({ lowercase: true, startsWith: "a" }), "ABC")).toEqual([true]);
      expect(string({ trim: true, min: 1 })("   ").ok).toBe(false);
    });

    it("should not touch the value when no clean-up is asked for", () => {
      expect(valueOf(string()("  Mixed Case  "))).toBe("  Mixed Case  ");
    });

    it("should refuse to lowercase and uppercase at once when the validator is created", () => {
      expect(() => string({ lowercase: true, uppercase: true })).toThrow(TypeError);
    });
  });

  it("should report every constraint that fails, in a fixed order", () => {
    const strict = string({ min: 5, pattern: /^\d+$/, startsWith: "9" });
    expect(issuesOf(strict("ab")).map((issue) => issue.params?.format ?? issue.code)).toEqual([
      "too_small",
      "regex",
      "startsWith",
    ]);
  });

  it("should never put the received value into an issue", () => {
    const secret = "hunter2";
    expect(JSON.stringify(issuesOf(string({ min: 20, pattern: /^\d+$/ })(secret)))).not.toContain(secret);
  });

  it("should give the same answer on every call", () => {
    const validator = string({ min: 2 });
    expect([validator("ab"), validator("ab")]).toEqual([validator("ab"), validator("ab")]);
  });
});
