import { describe, expect, it } from "vitest";

import { ValidationError, formatPath, val, type ValidationIssue } from "./index";
import { issuesOf } from "./test-utils";

const issue = (message: string, path: (string | number)[] = []): ValidationIssue => ({ code: "custom", message, path });

describe("formatPath", () => {
  it("joins keys with dots and wraps indexes in brackets", () => {
    expect(formatPath(["user", "addresses", 0, "street"])).toBe("user.addresses[0].street");
    expect(formatPath([0, "title"])).toBe("[0].title");
    expect(formatPath([1, 2])).toBe("[1][2]");
  });

  it("returns an empty string for the root", () => {
    expect(formatPath([])).toBe("");
  });
});

describe("ValidationError", () => {
  it("is an Error named ValidationError that carries its issues", () => {
    const error = new ValidationError([issue("bad")]);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ValidationError");
    expect(error.issues).toEqual([issue("bad")]);
  });

  it("uses the message of a single issue, prefixed with its path", () => {
    expect(new ValidationError([issue("bad")]).message).toBe("bad");
    expect(new ValidationError([issue("bad", ["a", 0])]).message).toBe("a[0]: bad");
  });

  it("lists every issue when there are several", () => {
    const error = new ValidationError([issue("one", ["a"]), issue("two")]);
    expect(error.message).toBe("2 validation issues:\n- a: one\n- two");
  });

  it("gives a readable message when thrown by parse", () => {
    expect(() => val.object({ a: val.string() }).parse({ a: 1 })).toThrow("a: Expected string, received number");
  });

  describe("flatten", () => {
    it("puts root issues in formErrors and groups the rest by path", () => {
      const error = new ValidationError([
        issue("root"),
        issue("a1", ["a"]),
        issue("a2", ["a"]),
        issue("deep", ["b", 0, "c"]),
      ]);
      expect(error.flatten()).toEqual({
        formErrors: ["root"],
        fieldErrors: { a: ["a1", "a2"], "b[0].c": ["deep"] },
      });
    });

    it("works on the error of a failed validation", () => {
      const result = val.object({ a: val.string(), b: val.object({ c: val.number() }) }).validate({ b: { c: "x" } });
      expect(result.ok ? undefined : result.error.flatten().fieldErrors).toEqual({
        a: ["Expected string, received undefined"],
        "b.c": ["Expected number, received string"],
      });
    });

    it("cannot be confused by a field named like an Object.prototype member", () => {
      const { fieldErrors } = new ValidationError([issue("x", ["__proto__"]), issue("y", ["constructor"])]).flatten();
      expect(fieldErrors.constructor).toEqual(["y"]);
      expect(Object.getPrototypeOf(fieldErrors)).toBeNull();
      expect(Object.keys(fieldErrors).sort()).toEqual(["__proto__", "constructor"]);
    });
  });
});

describe("issues", () => {
  it("carry a code, message and path, and only the extras that apply", () => {
    const [found] = issuesOf(val.string().min(3).validate("a"));
    expect(found).toEqual({
      code: "too_small",
      message: "Must be at least 3 characters",
      path: [],
      params: { minimum: 3, type: "string" },
    });
  });

  it("give the message function the details, including the path and input when retained", () => {
    const seen: unknown[] = [];
    val
      .object({ a: val.string().min(3, (details) => (seen.push(details), "x")) })
      .validate({ a: "z" }, { includeInput: true });
    expect(seen).toEqual([{ code: "too_small", path: ["a"], params: { minimum: 3, type: "string" }, input: "z" }]);
  });
});
