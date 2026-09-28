import { describe, expect, expectTypeOf, it } from "vitest";

import { boolean } from "./boolean";
import { type Infer, type InferInput } from "./core";
import { val } from "./index";

describe("BooleanValidator", () => {
  it("validates boolean primitives and rejects non-booleans", () => {
    const schema = val.boolean();

    expect(schema.validate(true)).toEqual({ ok: true, value: true });
    expect(schema.validate(false)).toEqual({ ok: true, value: false });

    expect(schema.validate("true")).toEqual({
      ok: false,
      error: {
        code: "invalid_type",
        message: "Expected boolean, got true",
        path: [],
        expected: "boolean",
        received: "true",
      },
    });

    expect(schema.validate(1)).toMatchObject({ ok: false });
    expect(schema.validate(null)).toMatchObject({ ok: false });
    expect(schema.validate(undefined)).toMatchObject({ ok: false });

    expect(schema.is(true)).toBe(true);
    expect(schema.is(false)).toBe(true);
    expect(schema.is("true")).toBe(false);
  });

  it("enforces .true() constraint with default and custom messages", () => {
    const defaultSchema = boolean().true();
    expect(defaultSchema.validate(true)).toEqual({ ok: true, value: true });
    expect(defaultSchema.validate(false)).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Must be true",
        path: [],
        expected: "true",
        received: "false",
      },
    });

    const customSchema = boolean().true("Terms must be accepted");
    expect(customSchema.validate(false, { path: ["terms"] })).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Terms must be accepted",
        path: ["terms"],
        expected: "true",
        received: "false",
      },
    });
  });

  it("enforces .false() constraint with default and custom messages", () => {
    const defaultSchema = boolean().false();
    expect(defaultSchema.validate(false)).toEqual({ ok: true, value: false });
    expect(defaultSchema.validate(true)).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Must be false",
        path: [],
        expected: "false",
        received: "true",
      },
    });

    const customSchema = boolean().false("Account must not be disabled");
    expect(customSchema.validate(true, { path: ["disabled"] })).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Account must not be disabled",
        path: ["disabled"],
        expected: "false",
        received: "true",
      },
    });
  });

  it("supports chaining modifiers: optional, nullable, default, refine, transform", () => {
    const opt = val.boolean().optional();
    expect(opt.validate(undefined)).toEqual({ ok: true, value: undefined });
    expect(opt.validate(true)).toEqual({ ok: true, value: true });

    const withDefault = val.boolean().default(false);
    expect(withDefault.validate(undefined)).toEqual({ ok: true, value: false });
    expect(withDefault.validate(true)).toEqual({ ok: true, value: true });

    const transformed = val.boolean().transform((val) => (val ? "YES" : "NO"));
    expect(transformed.validate(true)).toEqual({ ok: true, value: "YES" });
    expect(transformed.validate(false)).toEqual({ ok: true, value: "NO" });

    type BOutput = Infer<typeof opt>;
    type BInput = InferInput<typeof opt>;
    expectTypeOf<[BOutput]>().toEqualTypeOf<[boolean | undefined]>();
    expectTypeOf<BInput>().toEqualTypeOf<unknown>();
  });

  it("does not mutate receiver when chaining constraints", () => {
    const base = val.boolean();
    const trueOnly = base.true();

    expect(base.validate(false).ok).toBe(true);
    expect(trueOnly.validate(false).ok).toBe(false);
  });
});
