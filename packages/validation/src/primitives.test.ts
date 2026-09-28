import { describe, expect, it } from "vitest";

import { type ValidationErr, val } from ".";

describe("Primitive Validators", () => {
  describe("val.null()", () => {
    const schema = val.null();

    it("accepts null", () => {
      expect(schema.validate(null)).toEqual({ ok: true, value: null });
    });

    it("rejects non-null values", () => {
      const res = schema.validate(undefined) as ValidationErr;
      expect(res.ok).toBe(false);
      expect(res.error.code).toBe("invalid_type");
      expect(res.error.expected).toBe("null");
      expect(schema.validate(0).ok).toBe(false);
      expect(schema.validate("").ok).toBe(false);
    });

    it("supports custom failure message", () => {
      const custom = val.null("Must be strictly null");
      const res = custom.validate(false) as ValidationErr;
      expect(res.ok).toBe(false);
      expect(res.error.message).toBe("Must be strictly null");
    });
  });

  describe("val.undefined()", () => {
    const schema = val.undefined();

    it("accepts undefined", () => {
      expect(schema.validate(undefined)).toEqual({ ok: true, value: undefined });
    });

    it("rejects non-undefined values", () => {
      const res = schema.validate(null) as ValidationErr;
      expect(res.ok).toBe(false);
      expect(res.error.code).toBe("invalid_type");
      expect(res.error.expected).toBe("undefined");
      expect(schema.validate(0).ok).toBe(false);
    });

    it("supports custom failure message", () => {
      const custom = val.undefined("Must be undefined");
      const res = custom.validate("val") as ValidationErr;
      expect(res.ok).toBe(false);
      expect(res.error.message).toBe("Must be undefined");
    });
  });

  describe("val.void()", () => {
    const schema = val.void();

    it("accepts undefined as void", () => {
      expect(schema.validate(undefined)).toEqual({ ok: true, value: undefined });
    });

    it("rejects non-undefined values", () => {
      const res = schema.validate(null) as ValidationErr;
      expect(res.ok).toBe(false);
      expect(res.error.code).toBe("invalid_type");
      expect(res.error.expected).toBe("void");
    });

    it("supports custom failure message", () => {
      const custom = val.void("Must be void");
      const res = custom.validate(123) as ValidationErr;
      expect(res.ok).toBe(false);
      expect(res.error.message).toBe("Must be void");
    });
  });

  describe("val.never()", () => {
    const schema = val.never();

    it("unconditionally rejects any value", () => {
      expect(schema.validate(null).ok).toBe(false);
      expect(schema.validate(undefined).ok).toBe(false);
      expect(schema.validate(123).ok).toBe(false);
      expect(schema.validate("string").ok).toBe(false);
      expect(schema.validate({}).ok).toBe(false);

      const res = schema.validate("hello") as ValidationErr;
      expect(res.error.code).toBe("custom");
      expect(res.error.expected).toBe("never");
    });

    it("supports custom failure message", () => {
      const custom = val.never("Never allowed");
      const res = custom.validate(123) as ValidationErr;
      expect(res.ok).toBe(false);
      expect(res.error.message).toBe("Never allowed");
    });
  });
});
