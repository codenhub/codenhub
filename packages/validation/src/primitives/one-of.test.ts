import { describe, expect, it } from "vitest";

import { accepts, issuesOf, valueOf } from "../test-utils";
import { oneOf } from "./one-of";

describe("oneOf", () => {
  it("should accept any listed string or number, and nothing else", () => {
    const role = oneOf(["admin", "user"]);
    expect(accepts(role, "admin", "user", "guest", "ADMIN", 1, null)).toEqual([true, true, false, false, false, false]);
    expect(accepts(oneOf([1, 2]), 1, 2, 3, "1")).toEqual([true, true, false, false]);
  });

  it("should accept booleans, bigints, null, undefined and symbols as literal does", () => {
    const token = Symbol("token");
    const mixed = oneOf([true, 1n, null, undefined, token]);
    expect(accepts(mixed, true, 1n, null, undefined, token, false, 1, Symbol("token"))).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
    const flag: boolean = valueOf(oneOf([true, false])(false));
    expect(flag).toBe(false);
  });

  it("should give the union of the listed values as its type", () => {
    const role: "admin" | "user" = valueOf(oneOf(["admin", "user"])("user"));
    expect(role).toBe("user");
  });

  it("should list the options in params", () => {
    expect(issuesOf(oneOf(["admin", "user"])("guest"))).toEqual([
      { code: "invalid_value", path: [], params: { options: ["admin", "user"] } },
    ]);
  });

  it("should copy the list, so changing it later has no effect", () => {
    const values = ["a", "b"];
    const validator = oneOf(values);
    values.push("c");
    expect(validator("c").ok).toBe(false);
  });

  it("should give each failure its own list, so changing one cannot change what is accepted", () => {
    const validator = oneOf(["a", "b"]);
    const reported = issuesOf(validator("c"))[0]?.params?.options as string[];
    reported.push("c");
    expect(validator("c").ok).toBe(false);
    expect(issuesOf(validator("c"))[0]?.params?.options).toEqual(["a", "b"]);
  });

  it("should refuse an empty list, which would accept nothing", () => {
    expect(() => oneOf([])).toThrow(new TypeError("oneOf() needs at least one value"));
  });

  it("should refuse NaN, which no value equals, so its entry could match nothing", () => {
    expect(() => oneOf([1, Number.NaN])).toThrow(RangeError);
  });

  it("should compare with ===, so -0 matches 0, and produce the listed value", () => {
    expect(Object.is(valueOf(oneOf([0])(-0)), 0)).toBe(true);
    expect(Object.is(valueOf(oneOf([-0, 1])(0)), -0)).toBe(true);
  });

  it("should refuse a list with a hole, which would be read as undefined", () => {
    // oxlint-disable-next-line no-sparse-arrays -- the hole is the case under test
    expect(() => oneOf([, "a"])).toThrow(new TypeError("oneOf() needs a list without holes"));
    expect(accepts(oneOf([undefined, "a"]), undefined)).toEqual([true]);
  });

  it("should refuse a Set or another object of a class, which would be read as an enum with no members", () => {
    expect(() => oneOf(new Set([1]) as never)).toThrow(new TypeError("oneOf() needs a list or an enum of primitives"));
    expect(() => oneOf(new Date() as never)).toThrow(TypeError);
    expect(accepts(oneOf(Object.assign(Object.create(null), { a: "a" })), "a")).toEqual([true]);
  });

  it("should read an object written like a numeric enum as one, ignoring what looks like a reverse mapping", () => {
    expect(accepts(oneOf({ a: 1, "1": "a" }), 1, "a")).toEqual([true, false]);
  });

  it("should report bigint options as their digits, so the issue can be sent as JSON", () => {
    const result = oneOf([1n, 2n])(3n);
    expect(issuesOf(result)[0]?.params).toEqual({ options: ["1", "2"], type: "bigint" });
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(issuesOf(oneOf([1n, "a"])(3n))[0]?.params).toEqual({ options: ["1", "a"] });
  });
});
