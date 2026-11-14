import { describe, expect, it } from "vitest";

import type { ValidationIssue } from "./types";
import {
  wordFormat,
  wordInteger,
  wordKey,
  wordMultiple,
  wordSize,
  wordType,
  wordUnion,
  wordUnknownKey,
  type Word,
} from "./words";

const ALL: readonly Word[] = [
  wordType,
  wordSize,
  wordFormat,
  wordInteger,
  wordMultiple,
  wordKey,
  wordUnknownKey,
  wordUnion,
];

/** What a validator that carries every word gives as a Standard Schema: the first word that has one. */
const brief = (issue: ValidationIssue): string =>
  issue.message ?? ALL.map((word) => word(issue)).find((worded) => worded !== undefined) ?? "Invalid value";

const at = (code: string, params?: Record<string, unknown>, message?: string): ValidationIssue => ({
  code,
  path: [],
  ...(params !== undefined && { params }),
  ...(message !== undefined && { message }),
});

describe("the default messages of a Standard Schema", () => {
  it("should give an issue's own message first", () => {
    expect(brief(at("too_small", { minimum: 2, type: "string" }, "Too short"))).toBe("Too short");
  });

  it.each([
    [at("invalid_type", { expected: "number", received: "string" }), "Expected number, received string"],
    [at("too_small", { minimum: 2, inclusive: true, type: "string" }), "Must be at least 2 characters"],
    [at("too_big", { maximum: 3, type: "array" }), "Must be at most 3 items"],
    [at("too_big", { maximum: 10, type: "record" }), "Must be at most 10 keys"],
    [at("too_big", { maximum: 1024, type: "file" }), "Must be at most 1024 bytes"],
    [at("too_small", { minimum: 2, type: "array", exact: true }), "Must be exactly 2 items"],
    [at("too_small", { minimum: 0, inclusive: false, type: "number" }), "Must be greater than 0"],
    [at("too_big", { maximum: 5, inclusive: false, type: "number" }), "Must be less than 5"],
    [at("too_big", { maximum: 5, inclusive: true, type: "number" }), "Must be at most 5"],
    [at("invalid_format", { format: "email" }), "Invalid email"],
    [at("invalid_value", { type: "number", format: "int" }), "Must be an integer"],
    [at("invalid_value", { type: "number", format: "safeInt" }), "Must be an integer"],
    [at("invalid_value", { expected: "a" }), "Invalid value"],
    // The key is the last segment of the path, so the message holds no text the sender chose.
    [at("unrecognized_key", { key: "role" }), "Unrecognized key"],
    [at("unrecognized_key", { key: "a\u2028b\u0085c\nd" }), "Unrecognized key"],
    [at("invalid_union", { issues: [] }), "Does not match any allowed type"],
    // A name that is a code identifier would reach a form's user as it is; what a check asks is worded by
    // englishMessages, which no validator carries.
    ...[
      "regex",
      "startsWith",
      "endsWith",
      "includes",
      "lowercase",
      "uppercase",
      "nonBlank",
      "isoDate",
      "creditCard",
      "sha256Hash",
    ].map((format): [ValidationIssue, string] => [at("invalid_format", { format, value: "ab" }), "Invalid value"]),
    [at("invalid_format", { format: "uuid" }), "Invalid uuid"],
    [at("invalid_format", { format: "constructor" }), "Invalid constructor"],
    [at("invalid_value", { type: "number", format: "multipleOf", value: 5 }), "Must be a multiple of 5"],
    [at("invalid_key", { issues: [] }), "Invalid key"],
    [at("too_big", { maximum: 1000, type: "issues" }), "Stopped after 1000 problems"],
    [at("too_big", { maximum: 128, type: "depth" }), "Must be at most 128 levels deep"],
    // A date is written in UTC, so the text is the same on every machine.
    [
      at("too_small", { minimum: new Date(0), inclusive: true, type: "date" }),
      "Must be at least 1970-01-01T00:00:00.000Z",
    ],
    [
      at("too_big", { maximum: "2026-01-01T00:00:00.000Z", inclusive: true, type: "date" }),
      "Must be at most 2026-01-01T00:00:00.000Z",
    ],
    [at("custom"), "Invalid value"],
    [at("a code of its own"), "Invalid value"],
  ])("should word %j as %j", (issue, worded) => {
    expect(brief(issue)).toBe(worded);
  });

  it("should have each issue worded by one word alone, so the order a validator carries them in is no matter", () => {
    const issues = [
      at("invalid_type", { expected: "number", received: "string" }),
      at("too_small", { minimum: 2, type: "string" }),
      at("invalid_format", { format: "email" }),
      at("invalid_value", { type: "number", format: "int" }),
      at("invalid_value", { type: "number", format: "multipleOf", value: 5 }),
      at("invalid_key"),
      at("unrecognized_key"),
      at("invalid_union"),
    ];
    for (const issue of issues) {
      expect(ALL.filter((word) => word(issue) !== undefined)).toHaveLength(1);
    }
  });
});
