import { describe, expect, it } from "vitest";

import { fail } from "../core/result";
import type { ValidationIssue } from "../core/types";
import { email } from "../formats/email";
import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { issuesOf } from "../test-utils";
import { flatten, formatIssue, formatPath } from "./format-issue";

const issue = (value: Partial<ValidationIssue> & { code: string }): ValidationIssue => ({ path: [], ...value });

describe("formatPath", () => {
  it("should join keys with dots and indexes with brackets", () => {
    expect(formatPath(["user", "addresses", 0, "street"])).toBe("user.addresses[0].street");
    expect(formatPath([0, "title"])).toBe("[0].title");
  });

  it("should be empty for the root", () => {
    expect(formatPath([])).toBe("");
  });
});

describe("formatIssue", () => {
  it("should prefer the issue's own message over everything else", () => {
    const own = issue({ code: "too_small", message: "Too short!" });
    expect(formatIssue(own, { too_small: "from map" })).toBe("Too short!");
  });

  it("should use the message map for the issue's code, as text or as a function", () => {
    const value = issue({ code: "too_small", params: { minimum: 3, type: "string" } });
    expect(formatIssue(value, { too_small: "Curto demais" })).toBe("Curto demais");
    expect(formatIssue(value, { too_small: (found) => `Min ${String(found.params?.minimum)}` })).toBe("Min 3");
  });

  it("should fall back to the built-in wording when the map has no entry, or an undefined one", () => {
    expect(formatIssue(issue({ code: "custom" }), { other: "x" })).toBe("Invalid value");
    expect(formatIssue(issue({ code: "custom" }), { custom: undefined })).toBe("Invalid value");
  });

  it("should describe the built-in codes the validators report", () => {
    const messageOf = (result: ReturnType<ReturnType<typeof string>>): string[] =>
      issuesOf(result).map((found) => formatIssue(found));

    expect(messageOf(string()(1))).toEqual(["Expected string, received number"]);
    expect(messageOf(string({ min: 3 })("a"))).toEqual(["Must be at least 3 characters"]);
    expect(messageOf(string({ max: 1 })("ab"))).toEqual(["Must be at most 1 characters"]);
    expect(messageOf(string({ length: 3 })("ab"))).toEqual(["Must be exactly 3 characters"]);
    expect(messageOf(string({ pattern: /^a$/ })("b"))).toEqual(["Must match /^a$/"]);
    expect(messageOf(string({ startsWith: "x" })("b"))).toEqual(['Must start with "x"']);
    expect(messageOf(string({ endsWith: "x" })("b"))).toEqual(['Must end with "x"']);
    expect(messageOf(string({ includes: "x" })("b"))).toEqual(['Must include "x"']);
    expect(messageOf(email()("nope"))).toEqual(["Invalid email address"]);
  });

  it("should word number limits with their inclusivity", () => {
    const messages = (result: ReturnType<ReturnType<typeof number>>): string[] =>
      issuesOf(result).map((found) => formatIssue(found));

    expect(messages(number({ min: 1 })(0))).toEqual(["Must be at least 1"]);
    expect(messages(number({ gt: 1 })(1))).toEqual(["Must be greater than 1"]);
    expect(messages(number({ max: 1 })(2))).toEqual(["Must be at most 1"]);
    expect(messages(number({ lt: 1 })(1))).toEqual(["Must be less than 1"]);
    expect(messages(number({ int: true })(1.5))).toEqual(["Must be an integer"]);
    expect(messages(number({ safeInt: true })(2 ** 60))).toEqual(["Must be a safe integer"]);
    expect(messages(number({ nonZero: true })(0))).toEqual(["Must not be zero"]);
    expect(messages(number({ multipleOf: 5 })(7))).toEqual(["Must be a multiple of 5"]);
  });

  it("should describe unrecognized keys, coercion failures and unions", () => {
    expect(formatIssue(issue({ code: "unrecognized_key", params: { key: "x" } }))).toBe('Unrecognized key "x"');
    expect(
      formatIssue(issue({ code: "invalid_type", params: { expected: "number", received: "string", coerced: true } })),
    ).toBe("Cannot convert string to number");
    expect(formatIssue(issue({ code: "invalid_union" }))).toBe("Does not match any of the allowed types");
  });

  it("should name an unknown format by its own name", () => {
    expect(formatIssue(issue({ code: "invalid_format", params: { format: "phone" } }))).toBe("Invalid phone");
  });

  it("should never echo the received value", () => {
    const secret = "hunter2";
    const messages = [string({ min: 20 })(secret), email()(secret), number()(secret)].flatMap((result) =>
      issuesOf(result).map((found) => formatIssue(found)),
    );
    expect(messages.join()).not.toContain(secret);
  });
});

describe("flatten", () => {
  it("should put root issues in formErrors and the rest under their path", () => {
    const failure = fail(
      { message: "Form is invalid" },
      { path: ["user", "email"], code: "invalid_format", params: { format: "email" } },
      { path: ["tags", 0], message: "Too short" },
      { path: ["user", "email"], message: "Required" },
    ).error;

    expect(flatten(failure)).toEqual({
      formErrors: ["Form is invalid"],
      fieldErrors: { "user.email": ["Invalid email address", "Required"], "tags[0]": ["Too short"] },
    });
  });

  it("should use the message map", () => {
    const failure = fail({ path: ["a"], code: "custom" }).error;
    expect(flatten(failure, { custom: "Oops" }).fieldErrors).toEqual({ a: ["Oops"] });
  });

  it("should not let a field named like an Object.prototype member collide", () => {
    const failure = fail({ path: ["constructor"], message: "bad" }, { path: ["__proto__"], message: "worse" }).error;
    const { fieldErrors } = flatten(failure);
    expect(fieldErrors.constructor).toEqual(["bad"]);
    expect(fieldErrors["__proto__"]).toEqual(["worse"]);
  });
});
