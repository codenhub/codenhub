import { describe, expect, it } from "vitest";

import { accepts, valueOf } from "../test-utils";
import { unknown } from "./unknown";

describe("unknown", () => {
  it("should accept every value, including null and undefined", () => {
    expect(accepts(unknown(), 1, "a", null, undefined, {}, [], Symbol("x"))).toEqual(Array(7).fill(true));
  });

  it("should pass the value through by identity", () => {
    const value = { a: 1 };
    expect(valueOf(unknown()(value))).toBe(value);
  });
});
