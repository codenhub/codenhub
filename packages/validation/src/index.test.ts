import { describe, expect, it } from "vitest";

import {
  assert,
  coerce,
  custom,
  err,
  flatten,
  formatPath,
  is,
  ok,
  parse,
  parseAsync,
  parseResult,
  val,
  validate,
  validateAsync,
  ValidationError,
  type ValidationResult,
} from ".";
import * as validation from ".";

describe("public entrypoint", () => {
  it("exposes validators through val instead of direct factory exports", () => {
    expect(validation).toHaveProperty("val");
    expect(validation).not.toHaveProperty("string");
    expect(validation).not.toHaveProperty("number");
    expect(validation).not.toHaveProperty("object");
    expect(validation).not.toHaveProperty("array");
  });
});

describe("validation results", () => {
  it("creates successful and failed results", () => {
    expect(ok("user-id")).toEqual({ ok: true, value: "user-id" });
    expect(err("Missing user id")).toEqual({
      ok: false,
      error: {
        code: "custom",
        message: "Missing user id",
        path: [],
      },
    });
  });

  it("parses result-like values and thrown errors into validation results", () => {
    expect(parseResult<number>({ ok: true, value: 1 })).toEqual({ ok: true, value: 1 });
    expect(parseResult<number>({ ok: false, error: { message: "Invalid port", path: ["port"] } })).toEqual({
      ok: false,
      error: {
        code: "custom",
        message: "Invalid port",
        path: ["port"],
      },
    });
    expect(parseResult<number>(new Error("Invalid value"))).toEqual({
      ok: false,
      error: {
        code: "custom",
        message: "Invalid value",
        path: [],
      },
    });
  });
});

describe("val", () => {
  it("validates strings and includes path metadata", () => {
    expect(
      val
        .string()
        .email()
        .validate(" USER@Example.COM ", { path: ["email"] }),
    ).toEqual({
      ok: true,
      value: "USER@example.com",
    });
    expect(
      val
        .string()
        .notEmpty()
        .validate("", { path: ["name"] }),
    ).toEqual({
      ok: false,
      error: {
        code: "too_small",
        message: "Value cannot be empty",
        path: ["name"],
        expected: "non-empty string",
        received: "empty string",
      },
    });
  });

  it("validates numbers and rejects invalid ranges", () => {
    expect(
      val
        .number()
        .port()
        .validate(3000, { path: ["port"] }),
    ).toEqual({ ok: true, value: 3000 });
    expect(
      val
        .number()
        .port()
        .validate(0, { path: ["port"] }),
    ).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Must be a valid port number (1-65535)",
        path: ["port"],
        expected: "integer from 1 to 65535",
        received: "0",
      },
    });
  });

  it("validates objects and arrays", () => {
    const objSchema = val.object({ email: val.string() });
    expect(objSchema.validate({ email: "user@example.com" })).toEqual({
      ok: true,
      value: { email: "user@example.com" },
    });
    expect(objSchema.validate({}, { path: ["user"] })).toEqual({
      ok: false,
      error: {
        code: "invalid_type",
        message: "Expected string, got undefined",
        path: ["user", "email"],
        expected: "string",
        received: "undefined",
      },
    });

    const arrSchema = val.array().nonEmpty();
    expect(arrSchema.validate([], { path: ["items"] })).toEqual({
      ok: false,
      error: {
        code: "too_small",
        message: "Array cannot be empty",
        path: ["items"],
        expected: "non-empty array",
        received: "empty array",
      },
    });
    expect(arrSchema.validate(["item"])).toEqual({
      ok: true,
      value: ["item"],
    });
  });

  it("exposes all Phase 3 factories on val", () => {
    expect(typeof val.discriminatedUnion).toBe("function");
    expect(typeof val.lazy).toBe("function");
    expect(typeof val.intersection).toBe("function");
    expect(typeof val.nativeEnum).toBe("function");
    expect(typeof val.instanceof).toBe("function");
    expect(typeof val.instanceOf).toBe("function");
    expect(typeof val.set).toBe("function");
    expect(typeof val.map).toBe("function");
    expect(typeof val.null).toBe("function");
    expect(typeof val.undefined).toBe("function");
    expect(typeof val.void).toBe("function");
    expect(typeof val.never).toBe("function");
  });
});

describe("coerce", () => {
  it("coerces primitive input", () => {
    expect(coerce.int("3000")).toEqual({ ok: true, value: 3000 });
    expect(coerce.number("3.14")).toEqual({ ok: true, value: 3.14 });
    expect(coerce.bool("yes")).toEqual({ ok: true, value: true });
    expect(coerce.string(123)).toEqual({ ok: true, value: "123" });
  });

  it("rejects invalid primitive coercion", () => {
    expect(coerce.int("3.14", { path: ["port"] })).toEqual({
      ok: false,
      error: {
        code: "invalid_format",
        message: 'Cannot coerce "3.14" to integer',
        path: ["port"],
        expected: "integer string",
        received: "3.14",
      },
    });
    expect(coerce.string(null)).toMatchObject({
      ok: false,
      error: {
        code: "invalid_type",
        message: "Cannot coerce null or undefined to string",
      },
    });
  });
});

describe("custom", () => {
  it("normalizes returned and thrown custom validator failures", () => {
    const userValidator = custom<string, unknown>((value): ValidationResult<string> => {
      if (typeof value !== "string") {
        return err({ code: "invalid_type", message: "Expected user id" });
      }
      if (!value.startsWith("usr_")) {
        return err({ code: "invalid_format", message: "Invalid user id" });
      }

      return ok(value);
    });

    expect(userValidator.validate("usr_123")).toEqual({ ok: true, value: "usr_123" });

    const messageValidator = custom(() => "Invalid user id");
    expect(messageValidator.validate("bad", { path: ["userId"] })).toEqual({
      ok: false,
      error: {
        code: "custom",
        message: "Invalid user id",
        path: ["userId"],
      },
    });

    const throwValidator = custom(() => {
      throw new Error("Unexpected validation failure");
    });
    expect(throwValidator.validate("bad", { path: ["userId"] })).toEqual({
      ok: false,
      error: {
        code: "custom",
        message: "Unexpected validation failure",
        path: ["userId"],
      },
    });
  });
});

describe("developer ergonomics helpers", () => {
  it("validates data synchronously with validate and val.validate", () => {
    const schema = val.string().email();
    expect(validate("test@example.com", schema)).toEqual({
      ok: true,
      value: "test@example.com",
    });
    expect(val.validate("test@example.com", schema)).toEqual({
      ok: true,
      value: "test@example.com",
    });
    expect(validate("not-an-email", schema)).toMatchObject({
      ok: false,
    });
    expect(val.validate("not-an-email", schema)).toMatchObject({
      ok: false,
    });
  });

  it("validates data asynchronously with validateAsync and val.validateAsync", async () => {
    const asyncSchema = val.string().refineAsync(async (s) => s.startsWith("ok_"));
    const validResult = await validateAsync("ok_user", asyncSchema);
    expect(validResult).toEqual({
      ok: true,
      value: "ok_user",
    });

    const invalidResult = await val.validateAsync("bad_user", asyncSchema);
    expect(invalidResult.ok).toBe(false);
  });

  it("parses data synchronously with parse and val.parse or throws ValidationError", () => {
    const schema = val.number().min(10);
    expect(parse(15, schema)).toBe(15);
    expect(val.parse(20, schema)).toBe(20);

    expect(() => parse(5, schema)).toThrow(ValidationError);
    expect(() => val.parse(5, schema)).toThrow(ValidationError);
  });

  it("parses data asynchronously with parseAsync and val.parseAsync or throws ValidationError", async () => {
    const schema = val.string().refineAsync(async (s) => s.length >= 3);
    await expect(parseAsync("abc", schema)).resolves.toBe("abc");
    await expect(val.parseAsync("abcd", schema)).resolves.toBe("abcd");

    await expect(parseAsync("a", schema)).rejects.toThrow(ValidationError);
    await expect(val.parseAsync("a", schema)).rejects.toThrow(ValidationError);
  });

  it("checks data type conformance using is and val.is", () => {
    const schema = val.number().int();
    expect(is(42, schema)).toBe(true);
    expect(val.is(42, schema)).toBe(true);
    expect(is("42", schema)).toBe(false);
    expect(val.is("42", schema)).toBe(false);
    expect(val.is(3.14, schema)).toBe(false);
  });

  it("asserts data type conformance using assert and val.assert or throws ValidationError", () => {
    const strSchema = val.string();
    const validValue: unknown = "hello";
    assert(validValue, strSchema);
    // TypeScript narrows validValue to string
    expect(validValue.toUpperCase()).toBe("HELLO");

    const numSchema = val.number();
    const validNum: unknown = 123;
    val.assert(validNum, numSchema);
    expect(validNum.toFixed(1)).toBe("123.0");

    expect(() => assert(123, strSchema)).toThrow(ValidationError);
    expect(() => val.assert("not-a-number", numSchema)).toThrow(ValidationError);
  });

  it("formats path segments using formatPath", () => {
    expect(formatPath(["user", "addresses", 0, "street"])).toBe("user.addresses[0].street");
    expect(formatPath([0, "title"])).toBe("[0].title");
    expect(formatPath([])).toBe("");
    expect(formatPath(["single"])).toBe("single");
  });

  it("flattens errors into formErrors and fieldErrors using standalone flatten", () => {
    const error = new ValidationError({
      message: "Root failure",
      issues: [
        { code: "custom", message: "Form-level issue", path: [] },
        { code: "invalid_format", message: "Invalid email", path: ["user", "email"] },
        { code: "too_small", message: "Item 0 invalid", path: ["items", 0, "name"] },
      ],
    });

    const flattened = flatten(error);
    expect(flattened).toEqual({
      formErrors: ["Form-level issue"],
      fieldErrors: {
        "user.email": ["Invalid email"],
        "items[0].name": ["Item 0 invalid"],
      },
    });

    // Test with ValidationErr and ValidationOk
    const objSchema = val.object({ name: val.string(), count: val.number() });
    const res = objSchema.validate({ name: 123 });
    expect(res.ok).toBe(false);
    expect(flatten(res)).toEqual({
      formErrors: [],
      fieldErrors: {
        name: ["Expected string, got 123"],
        count: ["Expected number, got undefined"],
      },
    });

    const okRes = objSchema.validate({ name: "alice", count: 1 });
    expect(flatten(okRes)).toEqual({
      formErrors: [],
      fieldErrors: {},
    });

    // Test with array of issues
    const issues = [
      { code: "custom" as const, message: "General issue", path: [] },
      { code: "too_small" as const, message: "Too short", path: ["title"] },
    ];
    expect(flatten(issues)).toEqual({
      formErrors: ["General issue"],
      fieldErrors: {
        title: ["Too short"],
      },
    });
  });
});
