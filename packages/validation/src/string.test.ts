import { describe, expect, it } from "vitest";

import { type ValidationErr, val } from ".";

describe("string validator constraints", () => {
  it("normalizes valid email addresses", () => {
    expect(val.string().email().validate(" User+tag@Example.COM ")).toEqual({
      ok: true,
      value: "User+tag@example.com",
    });
  });

  it("rejects plus addressing when disabled", () => {
    expect(
      val
        .string()
        .email({ allowPlus: false })
        .validate("user+tag@example.com", { path: ["email"] }),
    ).toEqual({
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
    expect(val.string().url().validate("example.com/docs")).toEqual({
      ok: true,
      value: "https://example.com/docs",
    });
    expect(
      val
        .string()
        .url()
        .validate("https://user@example.com", { path: ["url"] }),
    ).toEqual({
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
    expect(
      val
        .string()
        .url({ forceHttps: true })
        .validate("http://example.com", { path: ["url"] }),
    ).toEqual({
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
    expect(val.string().fileType([".jpg", "png"]).validate("avatar.PNG")).toEqual({ ok: true, value: "png" });
    expect(
      val
        .string()
        .fileType(["jpg", "png"])
        .validate("avatar.gif", { path: ["avatar"] }),
    ).toEqual({
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
    expect(
      val
        .string()
        .fileType(["png"])
        .validate("png", { path: ["avatar"] }),
    ).toEqual({
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
    expect(val.string().fileType(["", "."]).validate("avatar.png")).toEqual({
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
    expect(val.string().minLength(3, { trim: true }).validate("  abc  ")).toEqual({ ok: true, value: "abc" });
    expect(val.string().maxLength(3, { trim: true }).validate("  abc  ")).toEqual({ ok: true, value: "abc" });
    expect(
      val
        .string()
        .maxLength(3)
        .validate("  abc  ", { path: ["name"] }),
    ).toEqual({
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
    expect(val.string().minLength(Number.NaN).validate("abc")).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Minimum length must be a finite non-negative number",
        path: [],
      },
    });
    expect(val.string().maxLength(-1).validate("abc")).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Maximum length must be a finite non-negative number",
        path: [],
      },
    });
  });

  it("validates empty strings and regular expression matches", () => {
    expect(val.string().notEmpty().validate("  ")).toEqual({
      ok: false,
      error: {
        code: "too_small",
        message: "Value cannot be empty",
        path: [],
        expected: "non-empty string",
        received: "empty string",
      },
    });
    expect(
      val
        .string()
        .matches(/^abc-\d+$/)
        .validate("abc-123"),
    ).toEqual({ ok: true, value: "abc-123" });
    expect(
      val
        .string()
        .matches(/^usr_/, "Invalid user id")
        .validate("abc", { path: ["code"] }),
    ).toEqual({
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

describe("StringValidator core API", () => {
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

  it("accepts RFC 9562 UUID versions 1 through 8", () => {
    const schema = val.string().uuid();
    expect(schema.validate("123e4567-e89b-42d3-a456-426614174000").ok).toBe(true);
    expect(schema.validate("018f6e2b-2a9c-7000-8000-000000000000").ok).toBe(true);
    expect(schema.validate("018f6e2b-2a9c-8000-8000-000000000000").ok).toBe(true);
    expect(schema.validate("018f6e2b-2a9c-9000-8000-000000000000").ok).toBe(false);
  });

  it("resets regex lastIndex across repeated validations with stateful regex", () => {
    const schema = val.string().regex(/abc/g);
    expect(schema.validate("abc").ok).toBe(true);
    expect(schema.validate("abc").ok).toBe(true);
    expect(schema.validate("abc").ok).toBe(true);
  });

  it("does not mutate receiver when chaining constraints", () => {
    const base = val.string().min(3);
    const extended = base.max(5);

    expect(base.validate("abcdef").ok).toBe(true);
    expect(extended.validate("abcdef").ok).toBe(false);
  });
});

describe("StringValidator Phase 2 feature expansion", () => {
  describe("ip()", () => {
    it("validates IPv4 addresses by default or when version is v4", () => {
      const anyIp = val.string().ip();
      expect(anyIp.validate("192.168.1.1")).toEqual({ ok: true, value: "192.168.1.1" });
      expect(anyIp.validate("0.0.0.0")).toEqual({ ok: true, value: "0.0.0.0" });
      expect(anyIp.validate("255.255.255.255")).toEqual({ ok: true, value: "255.255.255.255" });

      const v4Only = val.string().ip({ version: "v4" });
      expect(v4Only.validate("127.0.0.1")).toEqual({ ok: true, value: "127.0.0.1" });
      expect(v4Only.validate("256.0.0.1").ok).toBe(false);
      expect(v4Only.validate("1.2.3").ok).toBe(false);
      expect(v4Only.validate("01.1.1.1").ok).toBe(false);
      expect(v4Only.validate("::1").ok).toBe(false);
    });

    it("validates IPv6 addresses by default or when version is v6", () => {
      const anyIp = val.string().ip();
      expect(anyIp.validate("::1")).toEqual({ ok: true, value: "::1" });
      expect(anyIp.validate("fe80::1")).toEqual({ ok: true, value: "fe80::1" });
      expect(anyIp.validate("2001:db8::1")).toEqual({ ok: true, value: "2001:db8::1" });

      const v6Only = val.string().ip({ version: "v6" });
      expect(v6Only.validate("::1")).toEqual({ ok: true, value: "::1" });
      expect(v6Only.validate("192.168.1.1").ok).toBe(false);
      expect(v6Only.validate("invalid:ipv6:address").ok).toBe(false);
    });

    it("supports custom failure message on ip", () => {
      const customIp = val.string().ip({ version: "v4" }, "Expected valid IPv4");
      const res = customIp.validate("not-an-ip");
      expect(res).toEqual({
        ok: false,
        error: {
          code: "invalid_format",
          message: "Expected valid IPv4",
          path: [],
          expected: "IPv4 address",
          received: "not-an-ip",
        },
      });
    });
  });

  describe("datetime()", () => {
    it("validates UTC ISO 8601 datetimes", () => {
      const schema = val.string().datetime();
      expect(schema.validate("2024-01-01T12:00:00Z")).toEqual({ ok: true, value: "2024-01-01T12:00:00Z" });
      expect(schema.validate("2024-01-01T12:00:00.000Z")).toEqual({ ok: true, value: "2024-01-01T12:00:00.000Z" });
      expect(schema.validate("2024-01-01T12:00:00.123456Z")).toEqual({
        ok: true,
        value: "2024-01-01T12:00:00.123456Z",
      });
      // Non-UTC timezone offset rejected by default
      expect(schema.validate("2024-01-01T12:00:00+02:00").ok).toBe(false);
      expect(schema.validate("not-a-datetime").ok).toBe(false);
    });

    it("validates ISO 8601 datetimes with offset when offset is true", () => {
      const schema = val.string().datetime({ offset: true });
      expect(schema.validate("2024-01-01T12:00:00Z")).toEqual({ ok: true, value: "2024-01-01T12:00:00Z" });
      expect(schema.validate("2024-01-01T12:00:00+02:00")).toEqual({ ok: true, value: "2024-01-01T12:00:00+02:00" });
      expect(schema.validate("2024-01-01T12:00:00-05:00")).toEqual({ ok: true, value: "2024-01-01T12:00:00-05:00" });
    });

    it("enforces exact precision constraints", () => {
      const exactPrecision = val.string().datetime({ precision: 3 });
      expect(exactPrecision.validate("2024-01-01T12:00:00.000Z")).toEqual({
        ok: true,
        value: "2024-01-01T12:00:00.000Z",
      });
      expect(exactPrecision.validate("2024-01-01T12:00:00Z").ok).toBe(false);
      expect(exactPrecision.validate("2024-01-01T12:00:00.00Z").ok).toBe(false);
      expect(exactPrecision.validate("2024-01-01T12:00:00.0000Z").ok).toBe(false);

      const zeroPrecision = val.string().datetime({ precision: 0 });
      expect(zeroPrecision.validate("2024-01-01T12:00:00Z")).toEqual({ ok: true, value: "2024-01-01T12:00:00Z" });
      expect(zeroPrecision.validate("2024-01-01T12:00:00.000Z").ok).toBe(false);
    });

    it("rejects invalid calendar dates like February 30", () => {
      const schema = val.string().datetime();
      expect(schema.validate("2024-02-30T12:00:00Z").ok).toBe(false);
      expect(schema.validate("2023-02-29T12:00:00Z").ok).toBe(false);
      // Valid leap day
      expect(schema.validate("2024-02-29T12:00:00Z").ok).toBe(true);
    });
  });

  describe("base64()", () => {
    it("validates valid base64 strings and rejects invalid formats", () => {
      const schema = val.string().base64();
      expect(schema.validate("SGVsbG8gV29ybGQ=")).toEqual({ ok: true, value: "SGVsbG8gV29ybGQ=" });
      expect(schema.validate("YW55IGNhcm5hbCBwbGVhc3VyZS4=")).toEqual({
        ok: true,
        value: "YW55IGNhcm5hbCBwbGVhc3VyZS4=",
      });
      expect(schema.validate("not-valid-base64!").ok).toBe(false);
      expect(schema.validate("===").ok).toBe(false);
    });

    it("supports custom failure message on base64", () => {
      const schema = val.string().base64("Must be base64 encoded");
      expect(schema.validate("bad")).toEqual({
        ok: false,
        error: {
          code: "invalid_format",
          message: "Must be base64 encoded",
          path: [],
          expected: "base64",
          received: "bad",
        },
      });
    });
  });

  describe("cuid2()", () => {
    it("validates cuid2 format", () => {
      const schema = val.string().cuid2();
      // Valid 24-character cuid2 starting with lowercase letter
      expect(schema.validate("tz4a98xxat96iws9zmbrgj3a")).toEqual({
        ok: true,
        value: "tz4a98xxat96iws9zmbrgj3a",
      });

      // Starts with digit
      expect(schema.validate("1z4a98xxat96iws9zmbrgj3a").ok).toBe(false);
      // Too short (< 24)
      expect(schema.validate("shortcuid").ok).toBe(false);
      // Uppercase characters
      expect(schema.validate("TZ4A98XXAT96IWS9ZMBRGJ3A").ok).toBe(false);
    });

    it("supports custom failure message on cuid2", () => {
      const schema = val.string().cuid2("Must be valid cuid2");
      expect(schema.validate("invalid")).toEqual({
        ok: false,
        error: {
          code: "invalid_format",
          message: "Must be valid cuid2",
          path: [],
          expected: "cuid2",
          received: "invalid",
        },
      });
    });
  });

  describe("json()", () => {
    it("parses valid JSON without schema", () => {
      const schema = val.string().json();
      expect(schema.validate('{"name":"Alice","age":30}')).toEqual({
        ok: true,
        value: { name: "Alice", age: 30 },
      });
      expect(schema.validate("42")).toEqual({ ok: true, value: 42 });
      expect(schema.validate('"simple string"')).toEqual({ ok: true, value: "simple string" });
      expect(schema.validate("[1, 2, 3]")).toEqual({ ok: true, value: [1, 2, 3] });
    });

    it("rejects invalid JSON syntax", () => {
      const schema = val.string().json(undefined, "Bad JSON format");
      expect(schema.validate("{bad json")).toEqual({
        ok: false,
        error: {
          code: "invalid_format",
          message: "Bad JSON format",
          path: [],
          expected: "JSON string",
          received: "{bad json",
        },
      });
    });

    it("validates parsed JSON against an inner schema", () => {
      const userSchema = val.object({
        name: val.string().min(1),
        score: val.number().min(0),
      });
      const schema = val.string().json(userSchema);

      expect(schema.validate('{"name":"Bob","score":100}')).toEqual({
        ok: true,
        value: { name: "Bob", score: 100 },
      });

      const invalidInner = schema.validate('{"name":"","score":-5}');
      expect(invalidInner.ok).toBe(false);
    });

    it("supports asynchronous schemas with validateAsync", async () => {
      const asyncSchema = val.string().refineAsync(async (val) => val === "allowed");
      const jsonSchema = val.string().json(asyncSchema);

      await expect(jsonSchema.validateAsync('"allowed"')).resolves.toEqual({
        ok: true,
        value: "allowed",
      });
      await expect(jsonSchema.validateAsync('"denied"')).resolves.toMatchObject({
        ok: false,
      });

      // Synchronous validate on async schema returns error
      const syncRes = jsonSchema.validate('"allowed"');
      expect(syncRes.ok).toBe(false);
      expect((syncRes as ValidationErr).error.message).toContain("validateAsync()");
    });

    it("chains string constraints before parsing JSON", () => {
      const schema = val.string().startsWith("{").json();
      expect(schema.validate('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
      expect(schema.validate("[1, 2]").ok).toBe(false);
    });
  });
});
