import { describe, expect, it } from "vitest";

import { pipe, val } from ".";

describe("pipe", () => {
  it("pipes coercion output into validator schema", () => {
    const portSchema = val.pipe(val.coerce.int(), val.number().port());

    expect(portSchema.validate("3000")).toEqual({
      ok: true,
      value: 3000,
    });

    expect(portSchema.validate("abc")).toEqual({
      ok: false,
      error: {
        code: "invalid_format",
        message: 'Cannot coerce "abc" to integer',
        path: [],
        expected: "integer string",
        received: "abc",
      },
    });

    expect(portSchema.validate("99999")).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Must be a valid port number (1-65535)",
        path: [],
        expected: "integer from 1 to 65535",
        received: "99999",
      },
    });
  });

  it("supports chaining multiple validators with top-level pipe function", () => {
    const schema = pipe(val.coerce.string(), val.string().trim(), val.string().email());

    expect(schema.validate("   user@example.com   ")).toEqual({
      ok: true,
      value: "user@example.com",
    });
  });

  it("supports .pipe() method on BaseValidator instances", () => {
    const schema = val.coerce.number().pipe(val.number().min(0));

    expect(schema.validate("42")).toEqual({
      ok: true,
      value: 42,
    });

    expect(schema.validate("-10")).toEqual({
      ok: false,
      error: {
        code: "too_small",
        message: "Must be at least 0",
        path: [],
        expected: "at least 0",
        received: "-10",
      },
    });
  });
});
