import { describe, expect, it } from "vitest";

import { accepts, issuesOf, valueOf } from "../test-utils";
import { nativeEnum } from "./native-enum";

enum Status {
  Active = "active",
  Archived = "archived",
}

enum Level {
  Low,
  High,
}

describe("nativeEnum", () => {
  it("should accept the values of a string enum, and not its keys", () => {
    expect(accepts(nativeEnum(Status), "active", "archived", "Active", "deleted")).toEqual([true, true, false, false]);
  });

  it("should accept the values of a numeric enum, and ignore the reverse-mapping names TypeScript adds", () => {
    expect(accepts(nativeEnum(Level), 0, 1, 2, "Low", "High")).toEqual([true, true, false, false, false]);
  });

  it("should give the enum type", () => {
    const status: Status = valueOf(nativeEnum(Status)("active"));
    expect(status).toBe(Status.Active);
  });

  it("should list the allowed values in params", () => {
    expect(issuesOf(nativeEnum(Level)(5))[0]?.params).toEqual({ options: [0, 1] });
  });

  it("should keep a string member whose value is the name of a numeric one", () => {
    enum Mixed {
      A = 1,
      B = "A",
    }
    expect(accepts(nativeEnum(Mixed), 1, "A", "B", 0)).toEqual([true, true, false, false]);
  });

  it("should refuse an enum without values, which would accept nothing", () => {
    expect(() => nativeEnum({})).toThrow(new TypeError("nativeEnum() needs an enum with at least one value"));
  });

  it("should work with a plain object written like an enum", () => {
    expect(accepts(nativeEnum({ a: "x", b: "y" } as const), "x", "a")).toEqual([true, false]);
  });
});
