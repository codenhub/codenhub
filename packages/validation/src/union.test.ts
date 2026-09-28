import { describe, expect, it } from "vitest";

import { val } from ".";

describe("UnionValidator", () => {
  it("succeeds when input matches one of the variants", () => {
    const schema = val.union([val.string(), val.number()]);

    expect(schema.validate("hello")).toEqual({
      ok: true,
      value: "hello",
    });

    expect(schema.validate(42)).toEqual({
      ok: true,
      value: 42,
    });
  });

  it("fails when all variants fail to match", () => {
    const schema = val.union([val.string(), val.number()]);
    const result = schema.validate(true);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Invalid union value: did not match any allowed variant",
        path: [],
        issues: [
          {
            code: "invalid_type",
            message: "Expected string, got true",
            path: [],
            expected: "string",
            received: "true",
          },
          {
            code: "invalid_type",
            message: "Expected number, got true",
            path: [],
            expected: "number",
            received: "true",
          },
        ],
      },
    });
  });

  it("succeeds with complex object union variants", () => {
    const textMessage = val.object({
      type: val.literal("text"),
      text: val.string(),
    });

    const imageMessage = val.object({
      type: val.literal("image"),
      url: val.string().url(),
    });

    const messageSchema = val.union([textMessage, imageMessage]);

    expect(
      messageSchema.validate({
        type: "text",
        text: "Hello world",
      }),
    ).toEqual({
      ok: true,
      value: {
        type: "text",
        text: "Hello world",
      },
    });

    expect(
      messageSchema.validate({
        type: "image",
        url: "https://example.com/pic.png",
      }),
    ).toEqual({
      ok: true,
      value: {
        type: "image",
        url: "https://example.com/pic.png",
      },
    });

    const failed = messageSchema.validate({
      type: "audio",
    });

    expect(failed.ok).toBe(false);
  });

  it("provides variants getter", () => {
    const variants = [val.string(), val.number()] as const;
    const schema = val.union(variants);

    expect(schema.variants).toBe(variants);
  });

  it("supports asynchronous validation across variants with validateAsync()", async () => {
    const asyncVariant1 = val.string().refineAsync(async (s) => s.startsWith("A-"), "Must start with A-");
    const asyncVariant2 = val.number().refineAsync(async (n) => n > 100, "Must be > 100");
    const schema = val.union([asyncVariant1, asyncVariant2]);

    const validStr = await schema.validateAsync("A-123");
    expect(validStr).toEqual({ ok: true, value: "A-123" });

    const validNum = await schema.validateAsync(200);
    expect(validNum).toEqual({ ok: true, value: 200 });

    const invalid = await schema.validateAsync("B-123");
    expect(invalid.ok).toBe(false);
  });
});
