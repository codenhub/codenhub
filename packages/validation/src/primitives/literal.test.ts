import { describe, expect, it } from "vitest";

import { accepts, issuesOf, valueOf } from "../test-utils";
import { literal } from "./literal";

describe("literal", () => {
  it("should accept exactly the value, compared with ===", () => {
    expect(accepts(literal("admin"), "admin", "Admin", "user", null)).toEqual([true, false, false, false]);
    expect(accepts(literal(1), 1, "1", true)).toEqual([true, false, false]);
    expect(accepts(literal(true), true, false, 1)).toEqual([true, false, false]);
  });

  it("should validate null, undefined and bigint, which is how they are checked", () => {
    expect(accepts(literal(null), null, undefined, 0)).toEqual([true, false, false]);
    expect(accepts(literal(undefined), undefined, null)).toEqual([true, false]);
    expect(accepts(literal(1n), 1n, 1)).toEqual([true, false]);
  });

  it("should refuse NaN, which no value equals, so the literal could accept nothing", () => {
    expect(() => literal(Number.NaN)).toThrow(RangeError);
  });

  it("should compare symbols by identity", () => {
    const id = Symbol("id");
    expect(accepts(literal(id), id, Symbol("id"))).toEqual([true, false]);
  });

  it("should return the literal", () => {
    expect(valueOf(literal("admin")("admin"))).toBe("admin");
  });

  it("should produce the declared value for -0, which === matches to 0", () => {
    expect(Object.is(valueOf(literal(0)(-0)), 0)).toBe(true);
    expect(Object.is(valueOf(literal(-0)(0)), -0)).toBe(true);
  });

  it("should report the expected value in params", () => {
    expect(issuesOf(literal("admin")("user"))).toEqual([
      { code: "invalid_value", path: [], params: { expected: "admin" } },
    ]);
  });

  it("should give a literal type, not the widened primitive", () => {
    const role: "admin" = valueOf(literal("admin")("admin"));
    expect(role).toBe("admin");
  });

  it("should report a bigint as its digits, so the issue can be sent as JSON", () => {
    const result = literal(1n)(2n);
    expect(issuesOf(result)[0]?.params).toEqual({ expected: "1", type: "bigint" });
    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
