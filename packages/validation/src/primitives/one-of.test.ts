import { describe, expect, it } from "vitest";

import { accepts, issuesOf, valueOf } from "../test-utils";
import { oneOf } from "./one-of";

describe("oneOf", () => {
  it("should accept any listed string or number, and nothing else", () => {
    const role = oneOf(["admin", "user"]);
    expect(accepts(role, "admin", "user", "guest", "ADMIN", 1, null)).toEqual([true, true, false, false, false, false]);
    expect(accepts(oneOf([1, 2]), 1, 2, 3, "1")).toEqual([true, true, false, false]);
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

  it("should accept nothing for an empty list", () => {
    expect(oneOf([])("x").ok).toBe(false);
  });

  it("should compare with ===, so NaN matches nothing and -0 matches 0", () => {
    expect(oneOf([Number.NaN])(Number.NaN).ok).toBe(false);
    expect(oneOf([0])(-0).ok).toBe(true);
  });
});
