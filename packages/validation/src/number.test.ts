import { describe, expect, it } from "vitest";

import { val } from "./index";
import { codesOf, issuesOf, messagesOf, valueOf } from "./test-utils";

const accepts = (schema: { validate(input: unknown): { ok: boolean } }, ...inputs: unknown[]) =>
  inputs.map((input) => schema.validate(input).ok);

describe("number", () => {
  it("accepts finite numbers, including zero, negatives and decimals", () => {
    expect(accepts(val.number(), 0, -0, -1.5, 42, Number.MAX_VALUE)).toEqual([true, true, true, true, true]);
  });

  it("rejects NaN and the infinities, naming what was received", () => {
    expect(messagesOf(val.number().validate(Number.NaN))).toEqual(["Expected number, received nan"]);
    expect(messagesOf(val.number().validate(Infinity))).toEqual(["Expected number, received infinity"]);
    expect(messagesOf(val.number().validate(-Infinity))).toEqual(["Expected number, received infinity"]);
  });

  it("rejects numeric strings, bigints and other types", () => {
    expect(accepts(val.number(), "1", 1n, true, null, undefined, [], {})).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("uses a custom message for the type failure", () => {
    expect(messagesOf(val.number("a number").validate("x"))).toEqual(["a number"]);
  });
});

describe("bounds", () => {
  it("min and max are inclusive, gt and lt are exclusive", () => {
    expect(accepts(val.number().min(2), 1, 2, 3)).toEqual([false, true, true]);
    expect(accepts(val.number().max(2), 1, 2, 3)).toEqual([true, true, false]);
    expect(accepts(val.number().gt(2), 2, 3)).toEqual([false, true]);
    expect(accepts(val.number().lt(2), 1, 2)).toEqual([true, false]);
  });

  it("reports too_small and too_big with the bound in params", () => {
    expect(issuesOf(val.number().min(2).validate(1))[0]).toMatchObject({
      code: "too_small",
      params: { minimum: 2, inclusive: true, type: "number" },
      message: "Must be at least 2",
    });
    expect(issuesOf(val.number().lt(2).validate(2))[0]).toMatchObject({
      code: "too_big",
      params: { maximum: 2, inclusive: false },
      message: "Must be less than 2",
    });
  });

  it("positive, negative, nonNegative and nonPositive", () => {
    expect(accepts(val.number().positive(), -1, 0, 1)).toEqual([false, false, true]);
    expect(accepts(val.number().negative(), -1, 0, 1)).toEqual([true, false, false]);
    expect(accepts(val.number().nonNegative(), -1, 0, 1)).toEqual([false, true, true]);
    expect(accepts(val.number().nonPositive(), -1, 0, 1)).toEqual([true, true, false]);
  });

  it("nonZero rejects zero of either sign", () => {
    expect(accepts(val.number().nonZero(), -1, 0, -0, 1)).toEqual([true, false, false, true]);
  });

  it("reports every violated bound", () => {
    expect(codesOf(val.number().min(10).int().validate(1.5))).toEqual(["too_small", "invalid_value"]);
  });
});

describe("integers and steps", () => {
  it("int rejects fractions", () => {
    expect(accepts(val.number().int(), 1, -3, 1.5)).toEqual([true, true, false]);
  });

  it("safeInt rejects integers a double cannot represent exactly", () => {
    expect(accepts(val.number().safeInt(), 1, 2 ** 53 - 1, 2 ** 53)).toEqual([true, true, false]);
  });

  it("multipleOf tolerates floating-point error", () => {
    expect(accepts(val.number().multipleOf(0.1), 0.3, 0.7, 0.35)).toEqual([true, true, false]);
    expect(accepts(val.number().multipleOf(5), 10, -15, 12)).toEqual([true, true, false]);
  });

  it("multipleOf and clamp reject impossible arguments when the schema is built", () => {
    expect(() => val.number().multipleOf(0)).toThrow(RangeError);
    expect(() => val.number().multipleOf(-1)).toThrow(RangeError);
    expect(() => val.number().clamp(5, 1)).toThrow(RangeError);
  });

  it("clamp moves the value into range instead of rejecting it", () => {
    const schema = val.number().clamp(0, 10);
    expect([-5, 5, 50].map((input) => valueOf(schema.validate(input)))).toEqual([0, 5, 10]);
  });
});

describe("bigint", () => {
  it("accepts bigints only", () => {
    expect(accepts(val.bigint(), 1n, 0n, -5n)).toEqual([true, true, true]);
    expect(messagesOf(val.bigint().validate(1))).toEqual(["Expected bigint, received number"]);
  });

  it("supports bounds", () => {
    expect(accepts(val.bigint().min(2n), 1n, 2n)).toEqual([false, true]);
    expect(accepts(val.bigint().max(2n), 2n, 3n)).toEqual([true, false]);
    expect(accepts(val.bigint().positive(), 0n, 1n)).toEqual([false, true]);
    expect(accepts(val.bigint().negative(), -1n, 0n)).toEqual([true, false]);
    expect(messagesOf(val.bigint().min(2n).validate(1n))).toEqual(["Must be at least 2"]);
  });
});
