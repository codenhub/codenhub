import { describe, expect, it } from "vitest";

import { val } from ".";

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
