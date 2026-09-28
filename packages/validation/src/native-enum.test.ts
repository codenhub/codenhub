import { describe, expect, it } from "vitest";

import { type ValidationErr, val } from ".";

enum NumericEnum {
  Up = 0,
  Down = 1,
}

enum StringEnum {
  Red = "RED",
  Green = "GREEN",
}

const ConstMap = {
  Admin: "ADMIN",
  User: "USER",
} as const;

describe("NativeEnumValidator", () => {
  it("validates numeric enum values and rejects reverse-mapped keys", () => {
    const schema = val.nativeEnum(NumericEnum);

    expect(schema.validate(NumericEnum.Up)).toEqual({ ok: true, value: 0 });
    expect(schema.validate(NumericEnum.Down)).toEqual({ ok: true, value: 1 });
    expect(schema.validate(0)).toEqual({ ok: true, value: 0 });
    expect(schema.validate(1)).toEqual({ ok: true, value: 1 });

    // Reverse mapping strings should NOT be accepted as valid enum values
    const rejectReverse = schema.validate("Up") as ValidationErr;
    expect(rejectReverse.ok).toBe(false);
    expect(rejectReverse.error.code).toBe("invalid_value");

    const rejectUnknown = schema.validate(99) as ValidationErr;
    expect(rejectUnknown.ok).toBe(false);
    expect(rejectUnknown.error.code).toBe("invalid_value");
  });

  it("validates string enum values", () => {
    const schema = val.nativeEnum(StringEnum);

    expect(schema.validate(StringEnum.Red)).toEqual({ ok: true, value: "RED" });
    expect(schema.validate(StringEnum.Green)).toEqual({ ok: true, value: "GREEN" });
    expect(schema.validate("RED")).toEqual({ ok: true, value: "RED" });

    const reject = schema.validate("BLUE") as ValidationErr;
    expect(reject.ok).toBe(false);
    expect(reject.error.code).toBe("invalid_value");
  });

  it("validates as const object maps", () => {
    const schema = val.nativeEnum(ConstMap);

    expect(schema.validate(ConstMap.Admin)).toEqual({ ok: true, value: "ADMIN" });
    expect(schema.validate("USER")).toEqual({ ok: true, value: "USER" });

    const reject = schema.validate("GUEST") as ValidationErr;
    expect(reject.ok).toBe(false);
    expect(reject.error.code).toBe("invalid_value");
  });

  it("supports custom error message", () => {
    const schema = val.nativeEnum(StringEnum, "Must be a valid color");
    const res = schema.validate("YELLOW") as ValidationErr;
    expect(res.ok).toBe(false);
    expect(res.error.message).toBe("Must be a valid color");
  });

  it("provides enum getter", () => {
    const schema = val.nativeEnum(StringEnum);
    expect(schema.enum).toBe(StringEnum);
  });
});
