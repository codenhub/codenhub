import { describe, expect, it } from "vitest";

import { assertSize, collectNested, describeType, fail, failIssue, invalidType, pass, toIssue } from "./result";
import type { ValidationIssue } from "./types";

describe("pass", () => {
  it("should wrap the value in a successful result", () => {
    expect(pass(42)).toEqual({ ok: true, value: 42 });
  });

  it("should keep object identity", () => {
    const value = { id: 1 };
    expect(pass(value).value).toBe(value);
  });
});

describe("fail", () => {
  it("should default to code custom at the value's own location", () => {
    expect(fail({})).toEqual({ ok: false, error: { issues: [{ code: "custom", path: [] }] } });
  });

  it("should keep the code, path, params and message it is given", () => {
    const result = fail({ code: "username_taken", path: ["user", 0], params: { name: "ada" }, message: "Taken" });
    expect(result).toEqual({
      ok: false,
      error: {
        issues: [{ code: "username_taken", path: ["user", 0], params: { name: "ada" }, message: "Taken" }],
      },
    });
  });

  it("should report several issues in the order given", () => {
    const result = fail({ code: "a" }, { code: "b" });
    expect(result.error.issues.map((issue) => issue.code)).toEqual(["a", "b"]);
  });

  it("should not add params or message keys that were not given", () => {
    expect(Object.keys(toIssue({ code: "x" }))).toEqual(["code", "path"]);
  });
});

describe("collectNested", () => {
  it("should add every issue with the segment in front of its path, without changing the originals", () => {
    const original = toIssue({ code: "x", path: ["b"] });
    const target: ValidationIssue[] = [];
    collectNested(target, [original], "a");
    expect(target[0]?.path).toEqual(["a", "b"]);
    expect(original.path).toEqual(["b"]);
  });

  it("should take more issues than can be spread as arguments", () => {
    const target: ValidationIssue[] = [];
    collectNested(
      target,
      Array.from({ length: 500_000 }, () => toIssue({ code: "x" })),
      "a",
    );
    expect(target).toHaveLength(500_000);
  });
});

describe("describeType", () => {
  it.each([
    [null, "null"],
    [[], "array"],
    [Number.NaN, "nan"],
    [Number.POSITIVE_INFINITY, "infinity"],
    [new Date(), "date"],
    [new Date(Number.NaN), "invalid date"],
    [new Map(), "map"],
    [new Set(), "set"],
    [new (class Widget {})(), "Widget"],
    [{}, "object"],
    [Object.create(null), "object"],
    ["text", "string"],
    [undefined, "undefined"],
    [1n, "bigint"],
  ])("should name %s as %s", (value, expected) => {
    expect(describeType(value)).toBe(expected);
  });

  it("should say object for an input that throws when inspected, instead of throwing", () => {
    const trap = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("trap");
        },
      },
    );
    const getter = Object.create({
      get constructor() {
        throw new Error("getter");
      },
    }) as object;
    expect([describeType(trap), describeType(getter)]).toEqual(["object", "object"]);
  });
});

describe("invalidType", () => {
  it("should name both types and never echo the value", () => {
    const result = invalidType("string", "hunter2-as-number-42".length);
    expect(result.error.issues).toEqual([
      { code: "invalid_type", path: [], params: { expected: "string", received: "number" } },
    ]);
  });
});

describe("failIssue", () => {
  it("should omit params when none are given", () => {
    expect(failIssue("custom").error.issues).toEqual([{ code: "custom", path: [] }]);
  });
});

describe("assertSize", () => {
  it("should accept non-negative integers", () => {
    expect(() => assertSize("Size", 0)).not.toThrow();
    expect(() => assertSize("Size", 5)).not.toThrow();
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("should throw a RangeError for %s", (size) => {
    expect(() => assertSize("Size", size)).toThrow(RangeError);
  });
});
