import { describe, expect, it } from "vitest";

import { err, fail, formatPath, normalizeError, parseResult, val, ValidationError } from ".";

describe("formatPath", () => {
  it("returns empty string for empty path", () => {
    expect(formatPath([])).toBe("");
  });

  it("formats single string segment", () => {
    expect(formatPath(["user"])).toBe("user");
  });

  it("formats nested string properties with dot notation", () => {
    expect(formatPath(["user", "profile", "name"])).toBe("user.profile.name");
  });

  it("formats numeric indices with brackets", () => {
    expect(formatPath(["items", 0])).toBe("items[0]");
    expect(formatPath(["matrix", 1, 2])).toBe("matrix[1][2]");
  });

  it("formats complex nested paths with objects and arrays", () => {
    expect(formatPath(["user", "addresses", 0, "street"])).toBe("user.addresses[0].street");
  });

  it("formats paths starting with a numeric index", () => {
    expect(formatPath([0, "title"])).toBe("[0].title");
  });
});

describe("ValidationError class", () => {
  it("is an instance of ValidationError and Error", () => {
    const error = new ValidationError({
      code: "invalid_value",
      message: "Value is invalid",
      path: ["field"],
    });

    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ValidationError");
    expect(error.code).toBe("invalid_value");
    expect(error.message).toBe("Value is invalid");
    expect(error.path).toEqual(["field"]);
    expect(error.stack).toBeDefined();
  });

  it("is created by err() and fail() helpers", () => {
    const fromErr = err("Test failure");
    expect(fromErr.error).toBeInstanceOf(ValidationError);
    expect(fromErr.error).toBeInstanceOf(Error);

    const fromFail = fail({ code: "too_small", message: "Too small", path: ["count"] });
    expect(fromFail.error).toBeInstanceOf(ValidationError);
    expect(fromFail.error.code).toBe("too_small");
    expect(fromFail.error.path).toEqual(["count"]);
  });

  it("is created by normalizeError()", () => {
    const normalizedStr = normalizeError("String error");
    expect(normalizedStr).toBeInstanceOf(ValidationError);
    expect(normalizedStr.message).toBe("String error");

    const nativeError = new Error("Native error");
    const normalizedNative = normalizeError(nativeError);
    expect(normalizedNative).toBeInstanceOf(ValidationError);
    expect(normalizedNative.message).toBe("Native error");

    const existingValidationError = new ValidationError({ code: "custom", message: "Already error" });
    expect(normalizeError(existingValidationError)).toBe(existingValidationError);
  });

  it("flattens a root error with empty path into formErrors", () => {
    const error = new ValidationError({
      code: "custom",
      message: "Form submission failed",
      path: [],
    });

    expect(error.flatten()).toEqual({
      formErrors: ["Form submission failed"],
      fieldErrors: {},
    });
  });

  it("flattens a field error with non-empty path into fieldErrors", () => {
    const error = new ValidationError({
      code: "invalid_type",
      message: "Must be a string",
      path: ["username"],
    });

    expect(error.flatten()).toEqual({
      formErrors: [],
      fieldErrors: {
        username: ["Must be a string"],
      },
    });
  });

  it("flattens aggregate issues with formErrors and nested fieldErrors", () => {
    const error = new ValidationError({
      code: "invalid_value",
      message: "Validation failed",
      path: [],
      issues: [
        { code: "custom", message: "Invalid overall form state", path: [] },
        { code: "missing_key", message: "Email is required", path: ["user", "email"] },
        { code: "invalid_format", message: "Invalid email format", path: ["user", "email"] },
        { code: "too_small", message: "Street too short", path: ["user", "addresses", 0, "street"] },
      ],
    });

    expect(error.flatten()).toEqual({
      formErrors: ["Invalid overall form state"],
      fieldErrors: {
        "user.email": ["Email is required", "Invalid email format"],
        "user.addresses[0].street": ["Street too short"],
      },
    });
  });
});

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
    expect(val.string().notEmpty().validate(123)).toEqual({
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
    expect(val.string().notEmpty().validate(123, { includeInput: true })).toEqual({
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

    expect(val.string().notEmpty().validate(nullPrototype)).toEqual({
      ok: false,
      error: {
        code: "invalid_type",
        message: "Expected string, got object",
        path: [],
        expected: "string",
        received: "object",
      },
    });
    expect(val.number().positive().validate(nullPrototype)).toEqual({
      ok: false,
      error: {
        code: "invalid_type",
        message: "Expected number, got object",
        path: [],
        expected: "number",
        received: "object",
      },
    });
    expect(
      val
        .array()
        .notEmpty()
        .validate(() => null),
    ).toEqual({
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

  it("parses existing ValidationError instances cleanly in parseResult", () => {
    const errorInstance = new ValidationError({ code: "too_big", message: "Overflow", path: ["num"] });
    const parsed = parseResult<number>(errorInstance);
    expect(parsed).toEqual({
      ok: false,
      error: errorInstance,
    });
  });
});
