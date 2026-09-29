import { describe, expect, it } from "vitest";

import { accepts, issuesOf } from "../test-utils";
import { never } from "./never";

describe("never", () => {
  it("should reject every value", () => {
    expect(accepts(never(), 1, "a", null, undefined, {}, [])).toEqual(Array(6).fill(false));
  });

  it("should name the received type and never the value", () => {
    expect(issuesOf(never()("secret"))).toEqual([
      { code: "invalid_type", path: [], params: { expected: "never", received: "string" } },
    ]);
  });
});
