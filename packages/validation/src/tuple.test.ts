import { describe, expect, expectTypeOf, it } from "vitest";

import { val, type Infer } from "./index";
import { codesOf, messagesOf, pathsOf, valueOf } from "./test-utils";

describe("tuple", () => {
  const pair = val.tuple([val.string(), val.number()]);

  it("validates each position", () => {
    expect(valueOf(pair.validate(["a", 1]))).toEqual(["a", 1]);
    expectTypeOf<Infer<typeof pair>>().toEqualTypeOf<[string, number]>();
  });

  it("locates position failures by index", () => {
    expect(pathsOf(pair.validate([1, "a"]))).toEqual([[0], [1]]);
  });

  it("rejects the wrong length", () => {
    expect(codesOf(pair.validate(["a"]))).toEqual(["too_small"]);
    expect(codesOf(pair.validate(["a", 1, 2]))).toEqual(["too_big"]);
    expect(messagesOf(pair.validate(["a"]))).toEqual(["Expected 2 items, received 1"]);
  });

  it("rejects non-arrays", () => {
    expect(messagesOf(pair.validate({}))).toEqual(["Expected array, received object"]);
  });

  it("rest accepts extra items of one type", () => {
    const withRest = pair.rest(val.boolean());
    expect(withRest.validate(["a", 1]).ok).toBe(true);
    expect(withRest.validate(["a", 1, true, false]).ok).toBe(true);
    expect(pathsOf(withRest.validate(["a", 1, true, "x"]))).toEqual([[3]]);
    expect(codesOf(withRest.validate(["a"]))).toEqual(["too_small"]);
    expect(messagesOf(withRest.validate(["a"]))).toEqual(["Expected at least 2 items, received 1"]);
    expectTypeOf<Infer<typeof withRest>>().toEqualTypeOf<[string, number, ...boolean[]]>();
  });
});
