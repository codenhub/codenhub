import { describe, expect, expectTypeOf, it } from "vitest";

import { type Infer } from "./core";
import { val } from "./index";
import { enumValidator, literal } from "./literal";

describe("LiteralValidator, EnumValidator, AnyValidator, UnknownValidator", () => {
  describe("val.literal()", () => {
    it("validates exact literal strings, numbers, and booleans", () => {
      const stringLit = val.literal("active");
      expect(stringLit.validate("active")).toEqual({ ok: true, value: "active" });
      expect(stringLit.validate("inactive")).toEqual({
        ok: false,
        error: {
          code: "invalid_value",
          message: 'Expected literal "active", got inactive',
          path: [],
          expected: '"active"',
          received: "inactive",
        },
      });

      const numLit = literal(42);
      expect(numLit.validate(42)).toEqual({ ok: true, value: 42 });
      expect(numLit.validate(43)).toMatchObject({ ok: false });

      const boolLit = val.literal(true);
      expect(boolLit.validate(true)).toEqual({ ok: true, value: true });
      expect(boolLit.validate(false)).toMatchObject({ ok: false });

      const nullLit = val.literal(null);
      expect(nullLit.validate(null)).toEqual({ ok: true, value: null });
      expect(nullLit.validate(undefined)).toMatchObject({ ok: false });

      expect(stringLit.is("active")).toBe(true);
      expect(stringLit.is("inactive")).toBe(false);

      type LitOut = Infer<typeof stringLit>;
      expectTypeOf<LitOut>().toEqualTypeOf<"active">();
    });

    it("supports custom failure messages", () => {
      const schema = val.literal("v1", "Only v1 API is supported");
      expect(schema.validate("v2", { path: ["api"] })).toEqual({
        ok: false,
        error: {
          code: "invalid_value",
          message: "Only v1 API is supported",
          path: ["api"],
          expected: '"v1"',
          received: "v2",
        },
      });
    });
  });

  describe("val.enum()", () => {
    it("validates enum values from tuple / array", () => {
      const roles = ["admin", "editor", "viewer"] as const;
      const schema = val.enum(roles);

      expect(schema.validate("admin")).toEqual({ ok: true, value: "admin" });
      expect(schema.validate("editor")).toEqual({ ok: true, value: "editor" });
      expect(schema.validate("viewer")).toEqual({ ok: true, value: "viewer" });

      expect(schema.validate("superuser")).toEqual({
        ok: false,
        error: {
          code: "invalid_value",
          message: "Expected one of [admin, editor, viewer], got superuser",
          path: [],
          expected: "admin, editor, viewer",
          received: "superuser",
        },
      });

      expect(schema.is("admin")).toBe(true);
      expect(schema.is("guest")).toBe(false);

      type Role = Infer<typeof schema>;
      expectTypeOf<Role>().toEqualTypeOf<"admin" | "editor" | "viewer">();
    });

    it("supports custom failure messages", () => {
      const schema = enumValidator(["asc", "desc"] as const, "Sort direction must be asc or desc");
      expect(schema.validate("up")).toEqual({
        ok: false,
        error: {
          code: "invalid_value",
          message: "Sort direction must be asc or desc",
          path: [],
          expected: "asc, desc",
          received: "up",
        },
      });
    });
  });

  describe("val.any() and val.unknown()", () => {
    it("accepts arbitrary input in val.any()", () => {
      const schema = val.any();
      expect(schema.validate("hello")).toEqual({ ok: true, value: "hello" });
      expect(schema.validate(123)).toEqual({ ok: true, value: 123 });
      expect(schema.validate({ a: 1 })).toEqual({ ok: true, value: { a: 1 } });
      expect(schema.validate(null)).toEqual({ ok: true, value: null });
      expect(schema.validate(undefined)).toEqual({ ok: true, value: undefined });

      expect(schema.is("anything")).toBe(true);
      expect(schema.is(null)).toBe(true);
    });

    it("accepts arbitrary input in val.unknown()", () => {
      const schema = val.unknown();
      expect(schema.validate(true)).toEqual({ ok: true, value: true });
      expect(schema.validate([1, 2, 3])).toEqual({ ok: true, value: [1, 2, 3] });

      type Unk = Infer<typeof schema>;
      expectTypeOf<Unk>().toEqualTypeOf<unknown>();
    });

    it("supports refinement and transformation on any / unknown", () => {
      const notNull = val.unknown().refine((v) => v !== null && v !== undefined, "Cannot be nullish");
      expect(notNull.validate(123)).toEqual({ ok: true, value: 123 });
      expect(notNull.validate(null)).toMatchObject({ ok: false });
    });
  });
});
