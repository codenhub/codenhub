import { describe, expect, it } from "vitest";

import { accepts, issuesOf, valueOf } from "../test-utils";
import { oneOf } from "./one-of";

enum Status {
  Active = "active",
  Archived = "archived",
}

enum Level {
  Low,
  High,
}

describe("oneOf over an enum", () => {
  it("should accept the values of a string enum, and not its keys", () => {
    expect(accepts(oneOf(Status), "active", "archived", "Active", "deleted")).toEqual([true, true, false, false]);
  });

  it("should accept the values of a numeric enum, and ignore the reverse-mapping names TypeScript adds", () => {
    expect(accepts(oneOf(Level), 0, 1, 2, "Low", "High")).toEqual([true, true, false, false, false]);
  });

  it("should give the enum type", () => {
    const status: Status = valueOf(oneOf(Status)("active"));
    expect(status).toBe(Status.Active);
  });

  it("should list the allowed values in params", () => {
    expect(issuesOf(oneOf(Level)(5))[0]?.params).toEqual({ options: [0, 1] });
  });

  it("should keep a string member whose value is the name of a numeric one", () => {
    enum Mixed {
      A = 1,
      B = "A",
    }
    expect(accepts(oneOf(Mixed), 1, "A", "B", 0)).toEqual([true, true, false, false]);
  });

  it("should refuse an enum without values, which would accept nothing", () => {
    expect(() => oneOf({})).toThrow(new TypeError("oneOf() needs at least one value"));
  });

  it("should work with a plain object written like an enum", () => {
    expect(accepts(oneOf({ a: "x", b: "y" } as const), "x", "a")).toEqual([true, false]);
  });
});
