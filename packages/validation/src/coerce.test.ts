import { describe, expect, it } from "vitest";

import { coerce } from ".";

describe("coerce", () => {
  it("coerces integer strings and rejects unsafe integers", () => {
    expect(coerce.int(" +42 ")).toEqual({ ok: true, value: 42 });
    expect(coerce.int("9007199254740992", { path: ["id"] })).toEqual({
      ok: false,
      error: {
        code: "invalid_format",
        message: 'Cannot coerce "9007199254740992" to integer',
        path: ["id"],
        expected: "safe integer string",
        received: "9007199254740992",
      },
    });
  });

  it("coerces decimal number strings and rejects exponent notation", () => {
    expect(coerce.number(".5")).toEqual({ ok: true, value: 0.5 });
    expect(coerce.number("1e3", { path: ["amount"] })).toEqual({
      ok: false,
      error: {
        code: "invalid_format",
        message: 'Cannot coerce "1e3" to number',
        path: ["amount"],
        expected: "number string",
        received: "1e3",
      },
    });
  });

  it("coerces supported boolean strings", () => {
    expect(coerce.bool(true)).toEqual({ ok: true, value: true });
    expect(coerce.bool("on")).toEqual({ ok: true, value: true });
    expect(coerce.bool("off")).toEqual({ ok: true, value: false });
    expect(coerce.bool("maybe", { path: ["enabled"] })).toEqual({
      ok: false,
      error: {
        code: "invalid_format",
        message: 'Cannot coerce "maybe" to boolean',
        path: ["enabled"],
        expected: "boolean string",
        received: "maybe",
      },
    });
  });

  it("coerces strings only from defined primitive values", () => {
    expect(coerce.string(123)).toEqual({ ok: true, value: "123" });
    expect(coerce.string(null, { path: ["name"] })).toEqual({
      ok: false,
      error: {
        code: "invalid_type",
        message: "Cannot coerce null or undefined to string",
        path: ["name"],
        expected: "defined primitive",
        received: "null",
      },
    });
    expect(coerce.string({ value: "name" })).toEqual({
      ok: false,
      error: {
        code: "invalid_type",
        message: "Cannot convert value to string",
        path: [],
        expected: "primitive",
        received: "object",
      },
    });
  });
});
