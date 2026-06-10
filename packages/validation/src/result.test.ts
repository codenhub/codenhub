import { describe, expect, it } from "vitest";

import { err, parseResult, val } from ".";

describe("result helpers", () => {
  it("normalizes string failures with a custom code and empty path", () => {
    expect(err("Invalid value")).toEqual({
      ok: false,
      error: {
        code: "custom",
        message: "Invalid value",
        path: [],
      },
    });
  });

  it("normalizes structured failures and nested issues", () => {
    expect(
      err({
        code: "invalid_value",
        message: "Invalid profile",
        path: ["profile"],
        expected: "valid profile",
        received: "invalid profile",
        issues: [
          {
            code: "missing_key",
            message: "Missing email",
            path: ["profile", "email"],
            expected: "required key",
            received: "missing",
          },
        ],
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Invalid profile",
        path: ["profile"],
        expected: "valid profile",
        received: "invalid profile",
        issues: [
          {
            code: "missing_key",
            message: "Missing email",
            path: ["profile", "email"],
            expected: "required key",
            received: "missing",
          },
        ],
      },
    });
  });

  it("falls back to custom code for unknown error codes", () => {
    expect(err({ code: "unexpected" as never, message: "Invalid" }).error.code).toBe("custom");
  });

  it("omits original input by default", () => {
    expect(val.string(123).notEmpty()).toEqual({
      ok: false,
      error: {
        code: "invalid_type",
        message: "Expected string, got 123",
        path: [],
        expected: "string",
        received: "123",
      },
    });
  });

  it("includes original input only when requested", () => {
    expect(val.string(123, { includeInput: true }).notEmpty()).toEqual({
      ok: false,
      error: {
        code: "invalid_type",
        message: "Expected string, got 123",
        path: [],
        expected: "string",
        received: "123",
        input: 123,
      },
    });
  });

  it("returns failures instead of throwing for non-stringifiable invalid input", () => {
    const nullPrototype = Object.create(null) as Record<string, unknown>;

    expect(val.string(nullPrototype).notEmpty()).toEqual({
      ok: false,
      error: {
        code: "invalid_type",
        message: "Expected string, got object",
        path: [],
        expected: "string",
        received: "object",
      },
    });
    expect(val.number(nullPrototype).positive()).toEqual({
      ok: false,
      error: {
        code: "invalid_type",
        message: "Expected number, got object",
        path: [],
        expected: "number",
        received: "object",
      },
    });
    expect(val.array(() => null).notEmpty()).toEqual({
      ok: false,
      error: {
        code: "invalid_type",
        message: "Expected array, got function",
        path: [],
        expected: "array",
        received: "function",
      },
    });
  });

  it("parses unknown failures into generic validation errors", () => {
    expect(parseResult<number>(null)).toEqual({
      ok: false,
      error: {
        code: "custom",
        message: "Invalid value",
        path: [],
      },
    });
  });
});
