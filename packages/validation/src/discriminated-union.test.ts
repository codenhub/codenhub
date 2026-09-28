import { describe, expect, it } from "vitest";

import { type Infer, type ValidationErr, val } from ".";

describe("DiscriminatedUnionValidator", () => {
  const circleSchema = val.object({
    kind: val.literal("circle"),
    radius: val.number().min(0),
  });

  const squareSchema = val.object({
    kind: val.literal("square"),
    size: val.number().min(0),
  });

  const shapeSchema = val.discriminatedUnion("kind", [circleSchema, squareSchema]);

  it("validates valid variants correctly", () => {
    const circle = shapeSchema.validate({ kind: "circle", radius: 10 });
    expect(circle).toEqual({
      ok: true,
      value: { kind: "circle", radius: 10 },
    });

    const square = shapeSchema.validate({ kind: "square", size: 5 });
    expect(square).toEqual({
      ok: true,
      value: { kind: "square", size: 5 },
    });
  });

  it("rejects non-object inputs", () => {
    const res = shapeSchema.validate("not an object") as ValidationErr;
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe("invalid_type");
  });

  it("fails with clear error at discriminator path when discriminator is invalid or missing", () => {
    const missing = shapeSchema.validate({ radius: 10 }) as ValidationErr;
    expect(missing.ok).toBe(false);
    expect(missing.error.code).toBe("invalid_value");
    expect(missing.error.path).toEqual(["kind"]);
    expect(missing.error.message).toContain('Invalid discriminator value for "kind"');

    const unknownKind = shapeSchema.validate({ kind: "triangle", side: 3 }) as ValidationErr;
    expect(unknownKind.ok).toBe(false);
    expect(unknownKind.error.code).toBe("invalid_value");
    expect(unknownKind.error.path).toEqual(["kind"]);
  });

  it("validates fields according to matched variant", () => {
    const invalidCircle = shapeSchema.validate({ kind: "circle", radius: -5 }) as ValidationErr;
    expect(invalidCircle.ok).toBe(false);
    expect(invalidCircle.error.path).toEqual(["radius"]);
    expect(invalidCircle.error.code).toBe("too_small");
  });

  it("supports asynchronous validation with async field schemas", async () => {
    const asyncCircle = val.object({
      kind: val.literal("circle"),
      radius: val.number().refineAsync(async (r) => r > 0, "Must be positive"),
    });
    const asyncSchema = val.discriminatedUnion("kind", [asyncCircle, squareSchema]);

    const res = await asyncSchema.validateAsync({ kind: "circle", radius: 10 });
    expect(res).toEqual({
      ok: true,
      value: { kind: "circle", radius: 10 },
    });

    const invalid = (await asyncSchema.validateAsync({ kind: "circle", radius: -1 })) as ValidationErr;
    expect(invalid.ok).toBe(false);
    expect(invalid.error.path).toEqual(["radius"]);
    expect(invalid.error.message).toBe("Must be positive");
  });

  it("throws error when variant does not define a literal validator on discriminator key", () => {
    const invalidVariant = val.object({
      type: val.string(),
      val: val.number(),
    });

    expect(() => {
      val.discriminatedUnion("type", [invalidVariant]);
    }).toThrow("Discriminated union variant does not define a literal validator");
  });

  it("provides variants getter", () => {
    expect(shapeSchema.variants).toEqual([circleSchema, squareSchema]);
  });

  it("infers union output type correctly", () => {
    type Shape = Infer<typeof shapeSchema>;
    const shape1: Shape = { kind: "circle", radius: 10 };
    const shape2: Shape = { kind: "square", size: 5 };
    expect(shape1.kind).toBe("circle");
    expect(shape2.kind).toBe("square");
  });
});
