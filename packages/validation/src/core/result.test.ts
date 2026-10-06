import { describe, expect, it } from "vitest";

import { assertSize, describeType, fail, issue, pass, toIssue, typeIssue } from "./result";

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
  it("should reject a code or a message that is not text, as check() does", () => {
    expect(() => fail({ code: 5 as never })).toThrow(new TypeError("issue.code must be a string, received number"));
    expect(() => fail({ message: {} as never })).toThrow(
      new TypeError("issue.message must be a string, received object"),
    );
    expect(() => fail(null as never)).toThrow(new TypeError("An issue must be an object, received null"));
  });

  it("should reject a path holding a symbol, which no path or field name can write", () => {
    expect(() => fail({ path: ["a", Symbol("b")] as never })).toThrow(
      new TypeError("issue.path must be a list of keys and indexes"),
    );
  });

  it("should reject a path with a hole, which holds no key or index", () => {
    // oxlint-disable-next-line unicorn/no-new-array -- a sparse list is the subject of the test
    expect(() => fail({ path: new Array(1) })).toThrow(new TypeError("issue.path must be a list of keys and indexes"));
  });

  it("should default to code custom at the value's own location", () => {
    expect(fail({})).toEqual({ ok: false, error: { issues: [{ code: "custom", path: [] }] } });
  });

  it("should refuse to build a failure with no issue", () => {
    expect(() => (fail as () => unknown)()).toThrow(TypeError);
  });

  it("should refuse a path that is not a list, which would be split into one segment per letter", () => {
    expect(() => fail({ path: "confirm" as unknown as string[] })).toThrow(TypeError);
    expect(() => fail({ code: "a" }, { path: 0 as unknown as string[] })).toThrow(TypeError);
    expect(fail({ path: undefined }).error.issues[0].path).toEqual([]);
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

describe("describeType", () => {
  it.each([
    [null, "null"],
    [[], "array"],
    [Number.NaN, "nan"],
    [Number.POSITIVE_INFINITY, "infinity"],
    [new Date(), "date"],
    [new Date(Number.NaN), "invalid date"],
    [new Map(), "object"],
    [new Set(), "object"],
    [new (class Widget {})(), "object"],
    [{}, "object"],
    [Object.create(null), "object"],
    ["text", "string"],
    [undefined, "undefined"],
    [1n, "bigint"],
  ])("should name %s as %s", (value, expected) => {
    expect(describeType(value)).toBe(expected);
  });

  it("should name a date given another prototype by what it holds", () => {
    expect(describeType(Object.setPrototypeOf(new Date(0), class Widget {}.prototype))).toBe("date");
  });

  it("should name a date stripped of its prototype an object, as it names one given Object.prototype", () => {
    expect([
      describeType(Object.setPrototypeOf(new Date(0), null)),
      describeType(Object.setPrototypeOf(new Date(0), Object.prototype)),
    ]).toEqual(["object", "object"]);
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

describe("typeIssue", () => {
  it("should name both types and never echo the value", () => {
    expect(typeIssue("string", "hunter2-as-number-42".length)).toEqual({
      code: "invalid_type",
      path: [],
      params: { expected: "string", received: "number" },
    });
  });
});

describe("issue", () => {
  it("should omit params when none are given", () => {
    expect(issue("custom")).toEqual({ code: "custom", path: [] });
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

  it.each([
    ["3", "string"],
    [null, "null"],
    [3n, "bigint"],
  ])("should throw a TypeError for %s, which is not a number at all", (size, received) => {
    expect(() => assertSize("Size", size as never)).toThrow(
      new TypeError(`Size must be a number, received ${received}`),
    );
  });
});
