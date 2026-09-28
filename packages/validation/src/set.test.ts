import { describe, expect, expectTypeOf, it } from "vitest";

import { val, type Infer } from "./index";
import { messagesOf, pathsOf, valueOf } from "./test-utils";

describe("set", () => {
  const ids = val.set(val.number());

  it("validates every value", () => {
    expect(valueOf(ids.validate(new Set([1, 2])))).toEqual(new Set([1, 2]));
    expectTypeOf<Infer<typeof ids>>().toEqualTypeOf<Set<number>>();
  });

  it("locates a bad value by its position", () => {
    expect(pathsOf(ids.validate(new Set([1, "a"])))).toEqual([[1]]);
  });

  it("rejects non-sets, including arrays", () => {
    expect(messagesOf(ids.validate([1]))).toEqual(["Expected set, received array"]);
  });

  it("checks size", () => {
    expect(ids.min(2).validate(new Set([1])).ok).toBe(false);
    expect(ids.max(1).validate(new Set([1, 2])).ok).toBe(false);
    expect(ids.nonEmpty().validate(new Set()).ok).toBe(false);
    expect(ids.nonEmpty().validate(new Set([1])).ok).toBe(true);
  });
});
