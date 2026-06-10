import { describe, expect, it } from "vitest";

import { coerce, custom, err, ok, parseResult, val, type ValidationResult } from ".";
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
    expect(val.string(" USER@Example.COM ", { path: ["email"] }).email()).toEqual({
      ok: true,
      value: "USER@example.com",
    });
    expect(val.string("", { path: ["name"] }).notEmpty()).toEqual({
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
    expect(val.number(3000, { path: ["port"] }).port()).toEqual({ ok: true, value: 3000 });
    expect(val.number(0, { path: ["port"] }).port()).toEqual({
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
    expect(val.object({ email: "user@example.com" }).hasKeys(["email"])).toEqual({
      ok: true,
      value: { email: "user@example.com" },
    });
    expect(val.object({}, { path: ["user"] }).hasKeys(["email"])).toEqual({
      ok: false,
      error: {
        code: "missing_key",
        message: "Missing required key: email",
        path: ["user", "email"],
        expected: "required key",
        received: "missing",
      },
    });
    expect(val.array([], { path: ["items"] }).notEmpty()).toEqual({
      ok: false,
      error: {
        code: "too_small",
        message: "Array cannot be empty",
        path: ["items"],
        expected: "non-empty array",
        received: "empty array",
      },
    });
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
    const userId = custom("usr_123", (value): ValidationResult<string> => {
      if (typeof value !== "string") {
        return err({ code: "invalid_type", message: "Expected user id" });
      }
      if (!value.startsWith("usr_")) {
        return err({ code: "invalid_format", message: "Invalid user id" });
      }

      return ok(value);
    });

    expect(userId).toEqual({ ok: true, value: "usr_123" });
    expect(custom("bad", () => "Invalid user id", { path: ["userId"] })).toEqual({
      ok: false,
      error: {
        code: "custom",
        message: "Invalid user id",
        path: ["userId"],
      },
    });
    expect(
      custom(
        "bad",
        () => {
          throw new Error("Unexpected validation failure");
        },
        { path: ["userId"] },
      ),
    ).toEqual({
      ok: false,
      error: {
        code: "custom",
        message: "Unexpected validation failure",
        path: ["userId"],
      },
    });
  });
});
