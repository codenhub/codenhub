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

  it("should distinguish NaN's never-equal nature, so a NaN literal matches nothing", () => {
    expect(literal(Number.NaN)(Number.NaN).ok).toBe(false);
  });

  it("should compare symbols by identity", () => {
    const id = Symbol("id");
    expect(accepts(literal(id), id, Symbol("id"))).toEqual([true, false]);
  });

  it("should return the literal", () => {
    expect(valueOf(literal("admin")("admin"))).toBe("admin");
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
});
