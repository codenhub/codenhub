import { describe, expect, it } from "vitest";

import { type ValidationErr, val } from ".";

describe("string validators", () => {
  it("normalizes valid email addresses", () => {
    expect(val.string(" User+tag@Example.COM ").email()).toEqual({ ok: true, value: "User+tag@example.com" });
  });

  it("rejects plus addressing when disabled", () => {
    expect(val.string("user+tag@example.com", { path: ["email"] }).email({ allowPlus: false })).toEqual({
      ok: false,
      error: {
        code: "invalid_format",
        message: "Invalid email address",
        path: ["email"],
        expected: "email address",
        received: "user+tag@example.com",
      },
    });
  });

  it("normalizes URLs and rejects credentials", () => {
    expect(val.string("example.com/docs").url()).toEqual({ ok: true, value: "https://example.com/docs" });
    expect(val.string("https://user@example.com", { path: ["url"] }).url()).toEqual({
      ok: false,
      error: {
        code: "invalid_format",
        message: "Invalid URL",
        path: ["url"],
        expected: "public URL",
        received: "https://user@example.com",
      },
    });
  });

  it("rejects non-HTTPS URLs when required", () => {
    expect(val.string("http://example.com", { path: ["url"] }).url({ forceHttps: true })).toEqual({
      ok: false,
      error: {
        code: "invalid_format",
        message: "Invalid URL",
        path: ["url"],
        expected: "HTTPS URL",
        received: "http://example.com",
      },
    });
  });

  it("validates file extensions against normalized allow lists", () => {
    expect(val.string("avatar.PNG").fileType([".jpg", "png"])).toEqual({ ok: true, value: "png" });
    expect(val.string("avatar.gif", { path: ["avatar"] }).fileType(["jpg", "png"])).toEqual({
      ok: false,
      error: {
        code: "invalid_format",
        message: 'File type "gif" not allowed. Allowed: jpg, png',
        path: ["avatar"],
        expected: "jpg, png",
        received: "gif",
      },
    });
  });

  it("rejects extensionless file names", () => {
    expect(val.string("png", { path: ["avatar"] }).fileType(["png"])).toEqual({
      ok: false,
      error: {
        code: "invalid_format",
        message: 'File type "missing" not allowed. Allowed: png',
        path: ["avatar"],
        expected: "png",
        received: "missing",
      },
    });
  });

  it("rejects empty file type allow lists", () => {
    expect(val.string("avatar.png").fileType(["", "."])).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Allowed file types cannot be empty",
        path: [],
        expected: "file type list",
      },
    });
  });

  it("validates trimmed and untrimmed string lengths", () => {
    expect(val.string("  abc  ").minLength(3, { trim: true })).toEqual({ ok: true, value: "abc" });
    expect(val.string("  abc  ").maxLength(3, { trim: true })).toEqual({ ok: true, value: "abc" });
    expect(val.string("  abc  ", { path: ["name"] }).maxLength(3)).toEqual({
      ok: false,
      error: {
        code: "too_big",
        message: "Must be at most 3 characters",
        path: ["name"],
        expected: "at most 3 characters",
        received: "7 characters",
      },
    });
  });

  it("rejects invalid length limits", () => {
    expect(val.string("abc").minLength(Number.NaN)).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Minimum length must be a finite non-negative number",
        path: [],
      },
    });
    expect(val.string("abc").maxLength(-1)).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Maximum length must be a finite non-negative number",
        path: [],
      },
    });
  });

  it("validates empty strings and regular expression matches", () => {
    expect(val.string("  ").notEmpty()).toEqual({
      ok: false,
      error: {
        code: "too_small",
        message: "Value cannot be empty",
        path: [],
        expected: "non-empty string",
        received: "empty string",
      },
    });
    expect(val.string("abc-123").matches(/^abc-\d+$/)).toEqual({ ok: true, value: "abc-123" });
    expect(val.string("abc", { path: ["code"] }).matches(/^usr_/, "Invalid user id")).toEqual({
      ok: false,
      error: {
        code: "invalid_format",
        message: "Invalid user id",
        path: ["code"],
        expected: "/^usr_/",
        received: "abc",
      },
    });
  });
});

describe("StringValidator (0.1.0 schema API)", () => {
  it("validates basic string type", () => {
    const schema = val.string();
    expect(schema.validate("hello")).toEqual({ ok: true, value: "hello" });
    expect(schema.validate(123)).toEqual({
      ok: false,
      error: {
        code: "invalid_type",
        message: "Expected string, got 123",
        path: [],
        expected: "string",
        received: "123",
      },
    });
    expect(schema.is("hello")).toBe(true);
    expect(schema.is(null)).toBe(false);
  });

  it("chains min, max, length, and nonEmpty with custom messages", () => {
    const schema = val.string().min(3, "Too short").max(5, "Too long");
    expect(schema.validate("abcd")).toEqual({ ok: true, value: "abcd" });
    expect(schema.validate("ab")).toEqual({
      ok: false,
      error: {
        code: "too_small",
        message: "Too short",
        path: [],
        expected: "at least 3 characters",
        received: "2 characters",
      },
    });
    expect(schema.validate("abcdef")).toEqual({
      ok: false,
      error: {
        code: "too_big",
        message: "Too long",
        path: [],
        expected: "at most 5 characters",
        received: "6 characters",
      },
    });

    const exactSchema = val.string().length(4, "Must be 4 chars");
    expect(exactSchema.validate("four")).toEqual({ ok: true, value: "four" });
    expect(exactSchema.validate("three")).toEqual({
      ok: false,
      error: {
        code: "too_big",
        message: "Must be 4 chars",
        path: [],
        expected: "exactly 4 characters",
        received: "5 characters",
      },
    });

    const nonEmptySchema = val.string().nonEmpty("Required string");
    expect(nonEmptySchema.validate("")).toEqual({
      ok: false,
      error: {
        code: "too_small",
        message: "Required string",
        path: [],
        expected: "non-empty string",
        received: "empty string",
      },
    });
  });

  it("validates UUIDs", () => {
    const schema = val.string().uuid("Invalid UUID v4");
    expect(schema.validate("123e4567-e89b-12d3-a456-426614174000")).toEqual({
      ok: true,
      value: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(schema.validate("not-a-uuid")).toEqual({
      ok: false,
      error: {
        code: "invalid_format",
        message: "Invalid UUID v4",
        path: [],
        expected: "UUID",
        received: "not-a-uuid",
      },
    });
  });

  it("validates startsWith, endsWith, and includes", () => {
    const schema = val.string().startsWith("pre_").endsWith("_post").includes("mid");
    expect(schema.validate("pre_mid_post")).toEqual({ ok: true, value: "pre_mid_post" });

    expect(schema.validate("bad_mid_post")).toEqual({
      ok: false,
      error: {
        code: "invalid_format",
        message: 'Must start with "pre_"',
        path: [],
        expected: 'string starting with "pre_"',
        received: "bad_mid_post",
      },
    });
    expect(schema.validate("pre_mid_bad")).toEqual({
      ok: false,
      error: {
        code: "invalid_format",
        message: 'Must end with "_post"',
        path: [],
        expected: 'string ending with "_post"',
        received: "pre_mid_bad",
      },
    });
    expect(schema.validate("pre__post")).toEqual({
      ok: false,
      error: {
        code: "invalid_format",
        message: 'Must include "mid"',
        path: [],
        expected: 'string containing "mid"',
        received: "pre__post",
      },
    });
  });

  it("transforms case and trims whitespace", () => {
    const trimmedUpper = val.string().trim().toUpperCase();
    expect(trimmedUpper.validate("  hello world  ")).toEqual({
      ok: true,
      value: "HELLO WORLD",
    });

    const lower = val.string().toLowerCase();
    expect(lower.validate("ABC")).toEqual({ ok: true, value: "abc" });
  });

  it("accumulates multiple issues when abortEarly is false", () => {
    const schema = val.string().min(5, "At least 5").startsWith("abc", "Must start with abc");
    const result = schema.validate("xy", { abortEarly: false });

    expect(result.ok).toBe(false);
    const error = (result as ValidationErr).error;
    expect(error.issues).toHaveLength(2);
    expect(error.issues?.[0].message).toBe("At least 5");
    expect(error.issues?.[1].message).toBe("Must start with abc");
  });

  it("aborts at first issue when abortEarly is true", () => {
    const schema = val.string().min(5, "At least 5").startsWith("abc", "Must start with abc");
    const result = schema.validate("xy", { abortEarly: true });

    expect(result.ok).toBe(false);
    const error = (result as ValidationErr).error;
    expect(error.message).toBe("At least 5");
    expect(error.issues).toBeUndefined();
  });

  it("supports aliases minLength, maxLength, notEmpty", () => {
    const schema = val.string().minLength(3).maxLength(6).notEmpty();
    expect(schema.validate("hello")).toEqual({ ok: true, value: "hello" });
    expect(schema.validate("hi")).toMatchObject({ ok: false });
    expect(schema.validate("toolongword")).toMatchObject({ ok: false });
  });
});
