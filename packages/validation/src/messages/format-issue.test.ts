import { describe, expect, it } from "vitest";

import { endsWith } from "../checks/ends-with";
import { includes } from "../checks/includes";
import { lowercase } from "../checks/lowercase";
import { multipleOf } from "../checks/multiple-of";
import { nonZero } from "../checks/non-zero";
import { pattern } from "../checks/pattern";
import { startsWith } from "../checks/starts-with";
import { unique } from "../checks/unique";
import { uppercase } from "../checks/uppercase";
import { array } from "../composition/array";
import { json } from "../composition/json";
import { map } from "../composition/map";
import { record } from "../composition/record";
import { set } from "../composition/set";
import { tuple } from "../composition/tuple";
import { union } from "../composition/union";
import { fail } from "../core/result";
import type { ValidationIssue, ValidationResult } from "../core/types";
import { base64 } from "../formats/base64";
import { cidr } from "../formats/cidr";
import { creditCard } from "../formats/credit-card";
import { domain } from "../formats/domain";
import { duration } from "../formats/duration";
import { email } from "../formats/email";
import { ip } from "../formats/ip";
import { jwt } from "../formats/jwt";
import { mac } from "../formats/mac";
import { phone } from "../formats/phone";
import { port } from "../formats/port";
import { searchParams } from "../formats/search-params";
import { semver } from "../formats/semver";
import { slug } from "../formats/slug";
import { time } from "../formats/time";
import { url } from "../formats/url";
import { uuid } from "../formats/uuid";
import { bigint } from "../primitives/bigint";
import { date } from "../primitives/date";
import { literal } from "../primitives/literal";
import { number } from "../primitives/number";
import { oneOf } from "../primitives/one-of";
import { string } from "../primitives/string";
import { unknown } from "../primitives/unknown";
import { issuesOf } from "../test-utils";
import { englishMessages } from "./english-messages";
import { flatten, formatIssue as formatWith, formatPath, type Messages } from "./format-issue";

const formatIssue = (issue: ValidationIssue, messages: Messages = englishMessages): string =>
  formatWith(issue, messages);

const issue = (value: Partial<ValidationIssue> & { code: string }): ValidationIssue => ({ path: [], ...value });

describe("without the English wording", () => {
  it("should use the issue's own message, an entry for its code, and nothing else", () => {
    expect(formatWith(issue({ code: "too_small", message: "Fixed" }), {})).toBe("Fixed");
    expect(formatWith(issue({ code: "too_small" }), { too_small: "Mine" })).toBe("Mine");
  });

  it("should say Invalid value when nothing supplies text, never the built-in wording", () => {
    const [found] = issuesOf(number({ min: 18 })(15));
    expect(formatWith(found as ValidationIssue, {})).toBe("Invalid value");
    expect(flatten({ issues: [found as ValidationIssue] }, {}).formErrors).toEqual(["Invalid value"]);
  });

  it("should refuse a missing map instead of wording every issue Invalid value", () => {
    const [found] = issuesOf(number({ min: 18 })(15));
    const error = new TypeError("messages must be a message map, such as englishMessages, received undefined");
    expect(() => formatWith(found as ValidationIssue, undefined as never)).toThrow(error);
    expect(() => flatten({ issues: [found as ValidationIssue] }, undefined as never)).toThrow(error);
    expect(() => formatWith(found as ValidationIssue, [] as never)).toThrow(TypeError);
  });
});

describe("englishMessages", () => {
  it("should have wording for every code the built-in validators report", () => {
    for (const code of [
      "invalid_type",
      "invalid_value",
      "invalid_format",
      "too_small",
      "too_big",
      "unrecognized_key",
      "invalid_key",
      "invalid_union",
      "invalid_intersection",
    ]) {
      expect(englishMessages[code]).toBeDefined();
    }
  });

  it("should be combined with a map of your own by spreading, keeping the rest of the wording", () => {
    const reworded: Messages = { ...englishMessages, too_small: "Too short" };
    const [small] = issuesOf(string({ min: 3 })("a"));
    const [type] = issuesOf(string()(1));
    expect(formatWith(small as ValidationIssue, reworded)).toBe("Too short");
    expect(formatWith(type as ValidationIssue, reworded)).toBe("Expected string, received number");
  });

  it("should not have wording for a code a custom validator invents", () => {
    expect(englishMessages["username_taken"]).toBeUndefined();
  });
});

describe("formatPath", () => {
  it("should join keys with dots and indexes with brackets", () => {
    expect(formatPath(["user", "addresses", 0, "street"])).toBe("user.addresses[0].street");
    expect(formatPath([0, "title"])).toBe("[0].title");
  });

  it("should be empty for the root", () => {
    expect(formatPath([])).toBe("");
  });

  it("should quote a key that dot notation would misread, so different paths never share a name", () => {
    expect(formatPath(["a.b"])).toBe('["a.b"]');
    expect(formatPath(["a", "b"])).toBe("a.b");
    expect(formatPath(["list", "[0]"])).toBe('list["[0]"]');
    expect(formatPath(["x", ""])).toBe('x[""]');
    expect(formatPath(["first-name", "0"])).toBe("first-name.0");
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
    const messageOf = (result: ValidationResult<unknown>): string[] =>
      issuesOf(result).map((found) => formatIssue(found));

    expect(messageOf(string()(1))).toEqual(["Expected string, received number"]);
    expect(messageOf(string({ min: 3 })("a"))).toEqual(["Must be at least 3 characters"]);
    expect(messageOf(string({ max: 1 })("ab"))).toEqual(["Must be at most 1 character"]);
    expect(messageOf(string({ min: 1 })(""))).toEqual(["Must be at least 1 character"]);
    expect(messageOf(string({ length: 1 })(""))).toEqual(["Must be exactly 1 character"]);
    expect(messageOf(string({ length: 3 })("ab"))).toEqual(["Must be exactly 3 characters"]);
    expect(messageOf(string(pattern(/^a$/))("b"))).toEqual(["Must match /^a$/"]);
    expect(messageOf(string(startsWith("x"))("b"))).toEqual(['Must start with "x"']);
    expect(messageOf(string(endsWith("x"))("b"))).toEqual(['Must end with "x"']);
    expect(messageOf(string(includes("x"))("b"))).toEqual(['Must include "x"']);
    expect(messageOf(email()("nope"))).toEqual(["Invalid email address"]);
  });

  it("should quote an affix as a string literal, so one holding a quote or line break reads unambiguously", () => {
    const messageOf = (result: ValidationResult<unknown>): string[] =>
      issuesOf(result).map((issue) => formatIssue(issue, englishMessages));
    expect(messageOf(string(startsWith('a"b'))("x"))).toEqual(['Must start with "a\\"b"']);
    expect(messageOf(string(endsWith("a\nb"))("x"))).toEqual(['Must end with "a\\nb"']);
    expect(messageOf(string(includes("\\"))("x"))).toEqual(['Must include "\\\\"']);
  });

  it("should word number limits with their inclusivity", () => {
    const messages = (result: ValidationResult<unknown>): string[] =>
      issuesOf(result).map((found) => formatIssue(found));

    expect(messages(number({ min: 1 })(0))).toEqual(["Must be at least 1"]);
    expect(messages(number({ gt: 1 })(1))).toEqual(["Must be greater than 1"]);
    expect(messages(number({ max: 1 })(2))).toEqual(["Must be at most 1"]);
    expect(messages(number({ lt: 1 })(1))).toEqual(["Must be less than 1"]);
    expect(messages(number({ int: true })(1.5))).toEqual(["Must be an integer"]);
    expect(messages(number({ safeInt: true })(2 ** 60))).toEqual(["Must be a safe integer"]);
    expect(messages(number(nonZero())(0))).toEqual(["Must not be zero"]);
    expect(messages(number(multipleOf(5))(7))).toEqual(["Must be a multiple of 5"]);
  });

  it("should describe the formats by their names", () => {
    const messageOf = (result: ValidationResult<unknown>): string[] =>
      issuesOf(result).map((found) => formatIssue(found));

    expect(messageOf(url()("x"))).toEqual(["Invalid URL"]);
    expect(messageOf(uuid()("x"))).toEqual(["Invalid UUID"]);
    expect(messageOf(ip({ version: "v4" })("x"))).toEqual(["Invalid IPv4 address"]);
    expect(messageOf(ip()("x"))).toEqual(["Invalid IP address"]);
  });

  it("should word every format and check added in 0.2", () => {
    const messageOf = (result: ValidationResult<unknown>): string | undefined =>
      issuesOf(result).map((found) => formatIssue(found))[0];
    expect(
      [
        base64({ url: true })("+"),
        domain()("localhost"),
        port()(0),
        phone()("1"),
        slug()("A"),
        semver()("v1"),
        jwt()("x"),
        creditCard()("1"),
        cidr()("x"),
        cidr({ version: "v4" })("x"),
        cidr({ version: "v6" })("x"),
        mac()("x"),
        time()("x"),
        duration()("x"),
        string(lowercase())("A"),
        string(uppercase())("a"),
      ].map(messageOf),
    ).toEqual([
      "Invalid base64url string",
      "Invalid domain name",
      "Invalid port",
      "Invalid phone number",
      "Invalid slug",
      "Invalid version",
      "Invalid token",
      "Invalid card number",
      "Invalid CIDR block",
      "Invalid IPv4 CIDR block",
      "Invalid IPv6 CIDR block",
      "Invalid MAC address",
      "Invalid time",
      "Invalid duration",
      "Must be lowercase",
      "Must be uppercase",
    ]);
    expect(messageOf(searchParams(unknown())(1))).toBe("Expected query string, received number");
  });

  it("should word bigint and date bounds", () => {
    const messages = (result: ValidationResult<unknown>): string[] =>
      issuesOf(result).map((found) => formatIssue(found));

    expect(messages(bigint({ min: 10n })(1n))).toEqual(["Must be at least 10"]);
    expect(messages(bigint({ lt: 10n })(10n))).toEqual(["Must be less than 10"]);
    const earliest = new Date("2026-01-01T00:00:00Z");
    expect(formatIssue(issuesOf(date({ min: earliest })(new Date("2025-01-01")))[0] as ValidationIssue)).toBe(
      "Must be on or after 2026-01-01T00:00:00.000Z",
    );
    expect(formatIssue(issuesOf(date({ max: earliest })(new Date("2027-01-01")))[0] as ValidationIssue)).toBe(
      "Must be on or before 2026-01-01T00:00:00.000Z",
    );
  });

  it("should describe literals and lists of allowed values, writing values as they appear in code", () => {
    expect(formatIssue(issuesOf(literal("admin")("x"))[0] as ValidationIssue)).toBe('Expected "admin"');
    expect(formatIssue(issuesOf(literal(1n)(1))[0] as ValidationIssue)).toBe("Expected 1n");
    expect(formatIssue(issuesOf(oneOf([1n, 2n])(1))[0] as ValidationIssue)).toBe("Expected one of 1n, 2n");
    expect(formatIssue(issuesOf(literal(null)(1))[0] as ValidationIssue)).toBe("Expected null");
    expect(formatIssue(issuesOf(oneOf(["a", "b"])("x"))[0] as ValidationIssue)).toBe('Expected one of "a", "b"');
    expect(formatIssue(issuesOf(oneOf([1, 2])(3))[0] as ValidationIssue)).toBe("Expected one of 1, 2");
  });

  it("should word collection sizes as a count of items, singular for one", () => {
    const messageOf = (result: ValidationResult<unknown>): string[] =>
      issuesOf(result).map((found) => formatIssue(found));

    expect(messageOf(array(string(), { min: 2 })(["a"]))).toEqual(["Must contain at least 2 items"]);
    expect(messageOf(array(string(), { min: 1 })([]))).toEqual(["Must contain at least 1 item"]);
    expect(messageOf(array(string(), { max: 1 })(["a", "b"]))).toEqual(["Must contain at most 1 item"]);
    expect(messageOf(array(string(), { length: 2 })(["a"]))).toEqual(["Must contain exactly 2 items"]);
    expect(messageOf(tuple([string(), string()])(["a"]))).toEqual(["Must contain exactly 2 items"]);
    expect(messageOf(tuple([string()], { rest: string() })([]))).toEqual(["Must contain at least 1 item"]);
    expect(messageOf(set(string(), { max: 0 })(new Set(["a"])))).toEqual(["Must contain at most 0 items"]);
    expect(messageOf(map(string(), string(), { min: 1 })(new Map()))).toEqual(["Must contain at least 1 item"]);
  });

  it("should word record sizes as a count of keys, singular for one", () => {
    const messageOf = (result: ValidationResult<unknown>): string[] =>
      issuesOf(result).map((found) => formatIssue(found));

    expect(messageOf(record(string(), string(), { min: 2 })({ a: "x" }))).toEqual(["Must contain at least 2 keys"]);
    expect(messageOf(record(string(), string(), { max: 1 })({ a: "x", b: "y" }))).toEqual([
      "Must contain at most 1 key",
    ]);
    expect(messageOf(record(string(), string(), { length: 0 })({ a: "x" }))).toEqual(["Must contain exactly 0 keys"]);
  });

  it("should describe duplicates, unions and JSON", () => {
    expect(formatIssue(issuesOf(array(string(), unique())(["a", "a"]))[0] as ValidationIssue)).toBe("Must be unique");
    expect(formatIssue(issuesOf(union([string()])(1))[0] as ValidationIssue)).toBe(
      "Does not match any of the allowed types",
    );
    expect(formatIssue(issuesOf(json()("{"))[0] as ValidationIssue)).toBe("Invalid JSON");
  });

  it("should word a union with the one option whose type the input had, by its first issue", () => {
    const messageOf = (result: ValidationResult<unknown>): string =>
      formatIssue(issuesOf(result)[0] as ValidationIssue);
    expect(messageOf(union([literal(""), email()])("nope"))).toBe("Invalid email address");
    expect(messageOf(union([number(), string({ min: 3 })])("ab"))).toBe("Must be at least 3 characters");
    expect(messageOf(union([oneOf(["a", "b"]), number({ int: true })])(1.5))).toBe("Must be an integer");
  });

  it("should word a union generically when no option or more than one had the input's type", () => {
    const messageOf = (result: ValidationResult<unknown>): string =>
      formatIssue(issuesOf(result)[0] as ValidationIssue);
    expect(messageOf(union([string(), number()])(true))).toBe("Does not match any of the allowed types");
    expect(messageOf(union([literal("a"), literal("b")])("c"))).toBe("Does not match any of the allowed types");
    expect(messageOf(union([string({ min: 5 }), string({ max: 1 })])("abc"))).toBe(
      "Does not match any of the allowed types",
    );
  });

  it("should quote an unrecognized key as a string literal, so quotes and line breaks in it stay inside", () => {
    expect(formatIssue(issue({ code: "unrecognized_key", params: { key: 'a"b\nc' } }))).toBe(
      String.raw`Unrecognized key "a\"b\nc"`,
    );
  });

  it("should describe unrecognized keys, coercion failures and unions", () => {
    expect(formatIssue(issue({ code: "unrecognized_key", params: { key: "x" } }))).toBe('Unrecognized key "x"');
    expect(
      formatIssue(issue({ code: "invalid_type", params: { expected: "number", received: "string", coerced: true } })),
    ).toBe("Cannot convert string to number");
    expect(formatIssue(issue({ code: "invalid_union" }))).toBe("Does not match any of the allowed types");
    expect(formatIssue(issue({ code: "invalid_intersection" }))).toBe("Conflicting values");
  });

  it("should say how to pass an object that is not plain, such as process.env", () => {
    expect(
      formatIssue(issue({ code: "invalid_type", params: { expected: "object", received: "non-plain object" } })),
    ).toBe("Expected a plain object; copy it first, as in { ...value }");
  });

  it("should word never and a missing or unknown tag without calling them types", () => {
    expect(formatIssue(issue({ code: "invalid_type", params: { expected: "never", received: "number" } }))).toBe(
      "Not allowed",
    );
    expect(formatIssue(issue({ code: "invalid_union", params: { discriminator: "type", options: ["a", "b"] } }))).toBe(
      'Expected type to be one of "a", "b"',
    );
    expect(formatIssue(issue({ code: "invalid_key", params: { issues: [] } }))).toBe("Invalid key");
  });

  it("should word a bad key with the first issue its key validator found", () => {
    const [short] = issuesOf(record(string({ min: 3 }), number())({ ab: 1 }));
    expect(formatIssue(short as ValidationIssue)).toBe("Invalid key: Must be at least 3 characters");
    const [repeated] = issuesOf(record(string({ case: "lower" }), number())({ A: 1, a: 2 }));
    expect(formatIssue(repeated as ValidationIssue)).toBe("Invalid key: Must be unique");
  });

  it("should word an encoded separator in a URL path", () => {
    const [encoded] = issuesOf(url({ path: string() })("https://example.com/a%2fb"));
    expect(formatIssue(encoded as ValidationIssue)).toBe("Invalid URL path: Must not hold an encoded / or \\");
    const custom = issue({ code: "invalid_key", params: { issues: [issue({ code: "x", message: "Reserved" })] } });
    expect(formatIssue(custom)).toBe("Invalid key: Reserved");
    expect(formatIssue(issue({ code: "invalid_key" }))).toBe("Invalid key");
  });

  it("should word the key validator's issue with the map in use, so an override reaches it", () => {
    const [short] = issuesOf(record(string({ min: 3 }), number())({ ab: 1 }));
    const french: Messages = { ...englishMessages, too_small: "Trop court" };
    expect(formatIssue(short as ValidationIssue, french)).toBe("Invalid key: Trop court");
  });

  it("should give a message function the map it was found in", () => {
    const seen: unknown[] = [];
    const messages: Messages = { custom: (_issue, map) => (seen.push(map), "x") };
    formatWith(issue({ code: "custom" }), messages);
    expect(seen).toEqual([messages]);
  });

  it("should name an unknown format by its own name", () => {
    expect(formatIssue(issue({ code: "invalid_format", params: { format: "postcode" } }))).toBe("Invalid postcode");
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

    expect(flatten(failure, englishMessages)).toEqual({
      formErrors: ["Form is invalid"],
      fieldErrors: { "user.email": ["Invalid email address", "Required"], "tags[0]": ["Too short"] },
    });
  });

  it("should not read a code from the prototype of the message map", () => {
    for (const code of ["toString", "constructor", "hasOwnProperty", "__proto__"]) {
      expect(formatIssue({ code, path: [] }, {})).toBe("Invalid value");
      expect(formatIssue({ code, path: [] })).toBe("Invalid value");
    }
    expect(formatIssue({ code: "toString", path: [] }, { toString: "Mine" })).toBe("Mine");
  });

  it("should use the message map", () => {
    const failure = fail({ path: ["a"], code: "custom" }).error;
    expect(flatten(failure, { custom: "Oops" }).fieldErrors).toEqual({ a: ["Oops"] });
  });

  it("should keep a dotted key apart from the nested path it looks like", () => {
    const { fieldErrors } = flatten(
      {
        issues: [
          { code: "x", path: ["a.b"] },
          { code: "y", path: ["a", "b"] },
        ],
      },
      {},
    );
    expect(Object.keys(fieldErrors)).toEqual(['["a.b"]', "a.b"]);
  });

  it("should not let a field named like an Object.prototype member collide", () => {
    const failure = fail({ path: ["constructor"], message: "bad" }, { path: ["__proto__"], message: "worse" }).error;
    const { fieldErrors } = flatten(failure, {});
    expect(fieldErrors.constructor).toEqual(["bad"]);
    expect(fieldErrors["__proto__"]).toEqual(["worse"]);
  });
});

describe("englishMessages, for issues no other test words", () => {
  it("should word a depth limit and an invalid_value with no known params", () => {
    expect(formatWith({ code: "too_big", path: [], params: { maximum: 3, type: "depth" } }, englishMessages)).toBe(
      "Must be nested at most 3 levels deep",
    );
    expect(formatWith({ code: "invalid_value", path: [], params: { type: "number" } }, englishMessages)).toBe(
      "Invalid value",
    );
  });

  it("should word a limit on recursive calls", () => {
    expect(formatWith({ code: "too_big", path: [], params: { maximum: 10, type: "calls" } }, englishMessages)).toBe(
      "Too complex to check within 10 recursive steps",
    );
  });
});
