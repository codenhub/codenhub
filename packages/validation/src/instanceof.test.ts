import { describe, expect, it } from "vitest";

import { type ValidationErr, val } from ".";

class CustomEntity {
  constructor(readonly id: string) {}
}

describe("InstanceofValidator", () => {
  it("validates built-in class instances", () => {
    const regExpSchema = val.instanceof(RegExp);
    const regex = /abc/i;
    expect(regExpSchema.validate(regex)).toEqual({
      ok: true,
      value: regex,
    });

    const errorSchema = val.instanceof(Error);
    const err = new TypeError("bad type");
    expect(errorSchema.validate(err)).toEqual({
      ok: true,
      value: err,
    });

    const uint8Schema = val.instanceof(Uint8Array);
    const bytes = new Uint8Array([1, 2, 3]);
    expect(uint8Schema.validate(bytes)).toEqual({
      ok: true,
      value: bytes,
    });
  });

  it("validates custom class instances", () => {
    const entitySchema = val.instanceof(CustomEntity);
    const entity = new CustomEntity("123");

    expect(entitySchema.validate(entity)).toEqual({
      ok: true,
      value: entity,
    });
  });

  it("rejects non-instances, plain objects, and primitives", () => {
    const entitySchema = val.instanceof(CustomEntity);

    const plainRes = entitySchema.validate({ id: "123" }) as ValidationErr;
    expect(plainRes.ok).toBe(false);
    expect(plainRes.error.code).toBe("invalid_type");
    expect(plainRes.error.message).toContain("Expected instance of CustomEntity");

    const nullRes = entitySchema.validate(null) as ValidationErr;
    expect(nullRes.ok).toBe(false);

    const strRes = entitySchema.validate("string") as ValidationErr;
    expect(strRes.ok).toBe(false);
  });

  it("supports custom error message", () => {
    const schema = val.instanceof(RegExp, "Must be a valid RegExp object");
    const res = schema.validate("not regex") as ValidationErr;
    expect(res.ok).toBe(false);
    expect(res.error.message).toBe("Must be a valid RegExp object");
  });

  it("supports val.instanceOf alias", () => {
    const schema = val.instanceOf(Date);
    const now = new Date();
    expect(schema.validate(now)).toEqual({ ok: true, value: now });
  });

  it("provides expected getter", () => {
    const schema = val.instanceof(RegExp);
    expect(schema.expected).toBe(RegExp);
  });
});
