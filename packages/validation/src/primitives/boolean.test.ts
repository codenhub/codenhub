import { describe, expect, it } from "vitest";

import { accepts, issuesOf } from "../test-utils";
import { boolean } from "./boolean";

describe("boolean", () => {
  it("should accept true and false", () => {
    expect(accepts(boolean(), true, false)).toEqual([true, true]);
  });

  it("should reject everything else, including truthy and falsy values and text", () => {
    expect(accepts(boolean(), 1, 0, "true", "false", null, undefined, {}, [])).toEqual(Array(8).fill(false));
  });

  it("should name the received type", () => {
    expect(issuesOf(boolean()("true"))[0]?.params).toEqual({ expected: "boolean", received: "string" });
  });
});

describe("boolean options and checks", () => {
  it("should word its own issues", () => {
    expect(issuesOf(boolean({ message: "Yes or no" })(1))[0]?.message).toBe("Yes or no");
  });

  it("should run checks after the type", () => {
    const mustAgree = (value: boolean) => (value ? undefined : [{ code: "must_agree", path: [] }]);
    expect(accepts(boolean(mustAgree), true, false, "true")).toEqual([true, false, false]);
  });
});
