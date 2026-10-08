import { describe, expect, it } from "vitest";

import type { ValidationIssue } from "../core/types";
import { brief } from "./brief";

const at = (code: string, params?: Record<string, unknown>, message?: string): ValidationIssue => ({
  code,
  path: [],
  ...(params !== undefined && { params }),
  ...(message !== undefined && { message }),
});

describe("brief", () => {
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
    [at("unrecognized_key", { key: "role" }), 'Unrecognized key "role"'],
    [at("invalid_union", { issues: [] }), "Does not match any allowed type"],
    [at("custom"), "Invalid value"],
    [at("a code of its own"), "Invalid value"],
  ])("should word %j as %j", (issue, worded) => {
    expect(brief(issue)).toBe(worded);
  });
});
