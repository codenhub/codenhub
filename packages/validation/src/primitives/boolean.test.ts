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
