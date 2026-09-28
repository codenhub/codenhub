import { describe, expect, expectTypeOf, it } from "vitest";

import { val, type Infer } from "./index";
import { codesOf, messagesOf, pathsOf, valueOf } from "./test-utils";

describe("array", () => {
  const numbers = val.array(val.number());

  it("validates every item and returns a new array", () => {
    const input = [1, 2, 3];
    const output = valueOf(numbers.validate(input));
    expect(output).toEqual(input);
    expect(output).not.toBe(input);
    expectTypeOf<Infer<typeof numbers>>().toEqualTypeOf<number[]>();
  });

  it("rejects non-arrays", () => {
    expect(messagesOf(numbers.validate("x"))).toEqual(["Expected array, received string"]);
    expect(numbers.validate({ length: 0 }).ok).toBe(false);
  });

  it("locates each bad item by index and reports them all", () => {
    expect(pathsOf(numbers.validate([1, "a", 3, "b"]))).toEqual([[1], [3]]);
    expect(pathsOf(numbers.validate([1, "a", 3, "b"], { abortEarly: true }))).toEqual([[1]]);
  });

  it("checks size", () => {
    expect([[], [1], [1, 2]].map((input) => numbers.min(1).validate(input).ok)).toEqual([false, true, true]);
    expect([[1], [1, 2], [1, 2, 3]].map((input) => numbers.max(2).validate(input).ok)).toEqual([true, true, false]);
    expect(codesOf(numbers.length(2).validate([1]))).toEqual(["too_small"]);
    expect(codesOf(numbers.length(2).validate([1, 2, 3]))).toEqual(["too_big"]);
    expect(numbers.nonEmpty().validate([]).ok).toBe(false);
    expect(messagesOf(numbers.min(2).validate([1]))).toEqual(["Must contain at least 2 items"]);
    expect(messagesOf(numbers.min(1).validate([]))).toEqual(["Must contain at least 1 item"]);
  });

  it("rejects an invalid size when the schema is built", () => {
    expect(() => numbers.min(-1)).toThrow(RangeError);
    expect(() => numbers.length(1.5)).toThrow(RangeError);
  });

  it("unique flags each repeat at its index", () => {
    expect(pathsOf(val.array(val.string()).unique().validate(["a", "b", "a", "b", "a"]))).toEqual([[2], [3], [4]]);
    expect(val.array(val.string()).unique().validate(["a", "b"]).ok).toBe(true);
  });

  it("unique compares objects by a key selector, and by identity without one", () => {
    const users = val.array(val.object({ id: val.number() }));
    expect(pathsOf(users.unique((user) => user.id).validate([{ id: 1 }, { id: 2 }, { id: 1 }]))).toEqual([[2]]);
    expect(users.unique().validate([{ id: 1 }, { id: 1 }]).ok).toBe(true);
  });

  it("runs unique on the output, after items are transformed", () => {
    const schema = val.array(val.string().toLowerCase()).unique();
    expect(pathsOf(schema.validate(["A", "a"]))).toEqual([[1]]);
  });

  it("accepts any item with unknown", () => {
    expect(val.array(val.unknown()).validate([1, "a", null]).ok).toBe(true);
  });

  it("uses a custom message for the type failure", () => {
    expect(messagesOf(val.array(val.number(), "a list").validate(1))).toEqual(["a list"]);
  });
});
