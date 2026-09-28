import { describe, expect, expectTypeOf, it } from "vitest";

import { val, type Infer } from "./index";
import { codesOf, issuesOf, messagesOf, valueOf } from "./test-utils";

describe("coerce.number", () => {
  const schema = val.coerce.number();

  it("converts numbers and decimal strings", () => {
    expect(["42", " 3.5 ", "-1", "+2", ".5", "5.", 7].map((input) => valueOf(schema.validate(input)))).toEqual([
      42, 3.5, -1, 2, 0.5, 5, 7,
    ]);
    expectTypeOf<Infer<typeof schema>>().toEqualTypeOf<number>();
  });

  it("rejects empty and non-numeric strings, hex, exponents, and non-finite numbers", () => {
    const rejected = ["", "  ", "abc", "1e3", "0x10", "1,5", "Infinity", "NaN", Infinity, Number.NaN].map(
      (input) => schema.validate(input).ok,
    );
    expect(rejected).not.toContain(true);
  });

  it("rejects booleans, null, objects and arrays instead of guessing", () => {
    const rejected = [true, null, undefined, {}, [5], new Date()].map((input) => schema.validate(input).ok);
    expect(rejected).not.toContain(true);
  });

  it("says what could not be converted, without echoing the input", () => {
    const [issue] = issuesOf(schema.validate("abc"));
    expect(issue).toMatchObject({ code: "invalid_type", message: "Cannot convert string to number" });
    expect(JSON.stringify(issue)).not.toContain("abc");
  });

  it("takes a custom message", () => {
    expect(messagesOf(val.coerce.number("not a number").validate("x"))).toEqual(["not a number"]);
  });

  it("still applies the rules of a number validator", () => {
    const port = val.coerce.number().int().min(1).max(65535);
    expect(valueOf(port.validate("8080"))).toBe(8080);
    expect(codesOf(port.validate("0"))).toEqual(["too_small"]);
    expect(codesOf(port.validate("1.5"))).toEqual(["invalid_value"]);
  });

  it("keeps coercing after rules are added", () => {
    expect(
      valueOf(
        val.coerce
          .number()
          .min(1)
          .refine((n) => n < 10)
          .validate("5"),
      ),
    ).toBe(5);
  });
});

describe("coerce.boolean", () => {
  const schema = val.coerce.boolean();

  it("converts the usual words in any case, ignoring surrounding whitespace", () => {
    expect(["true", "TRUE", " yes ", "On", "1", 1, true].map((input) => valueOf(schema.validate(input)))).toEqual(
      Array(7).fill(true),
    );
    expect(["false", "No", "off", "0", 0, false].map((input) => valueOf(schema.validate(input)))).toEqual(
      Array(6).fill(false),
    );
  });

  it("rejects anything else, so a typo is not read as false", () => {
    const rejected = ["", "maybe", "2", 2, null, undefined, {}].map((input) => schema.validate(input).ok);
    expect(rejected).not.toContain(true);
  });

  it("supports defaults for missing environment variables", () => {
    expect(valueOf(val.coerce.boolean().default(false).validate(undefined))).toBe(false);
  });
});

describe("coerce.string", () => {
  const schema = val.coerce.string();

  it("converts numbers, bigints and booleans", () => {
    expect([12, 1n, true, "a"].map((input) => valueOf(schema.validate(input)))).toEqual(["12", "1", "true", "a"]);
  });

  it("rejects null, undefined, objects, functions and symbols", () => {
    const rejected = [null, undefined, {}, [], () => 1, Symbol("s")].map((input) => schema.validate(input).ok);
    expect(rejected).not.toContain(true);
  });

  it("still applies string rules", () => {
    expect(val.coerce.string().min(3).validate(12).ok).toBe(false);
    expect(val.coerce.string().min(2).validate(12).ok).toBe(true);
  });
});

describe("coerce.bigint", () => {
  const schema = val.coerce.bigint();

  it("converts bigints, safe integers and integer strings", () => {
    expect([5n, 5, "5", " -7 ", "12345678901234567890"].map((input) => valueOf(schema.validate(input)))).toEqual([
      5n,
      5n,
      5n,
      -7n,
      12345678901234567890n,
    ]);
  });

  it("rejects fractions, unsafe numbers and text", () => {
    const rejected = [1.5, 2 ** 60, "1.5", "", "x", null, true].map((input) => schema.validate(input).ok);
    expect(rejected).not.toContain(true);
  });

  it("still applies bigint rules", () => {
    expect(val.coerce.bigint().min(10n).validate("5").ok).toBe(false);
  });
});

describe("coerce.date", () => {
  const schema = val.coerce.date();

  it("converts dates, timestamps and ISO 8601 strings", () => {
    const date = new Date("2026-09-28T00:00:00Z");
    expect(valueOf(schema.validate(date))).toBe(date);
    expect(valueOf(schema.validate(0)).getTime()).toBe(0);
    expect(valueOf(schema.validate("2026-09-28T00:00:00Z")).toISOString()).toBe("2026-09-28T00:00:00.000Z");
    expect(valueOf(schema.validate("2026-09-28")).toISOString()).toBe("2026-09-28T00:00:00.000Z");
  });

  it("rejects free-form strings, Invalid Date, and non-finite timestamps", () => {
    const rejected = ["yesterday", "", "09/28/2026", new Date("x"), Infinity, Number.NaN, null, {}].map(
      (input) => schema.validate(input).ok,
    );
    expect(rejected).not.toContain(true);
  });

  it("rejects a date that does not exist", () => {
    expect(schema.validate("2026-13-45").ok).toBe(false);
  });

  it("still applies date rules", () => {
    expect(val.coerce.date().min(new Date("2026-01-01")).validate("2025-01-01").ok).toBe(false);
  });
});

describe("coercing a whole environment", () => {
  it("parses text values into typed configuration", () => {
    const env = val.object({
      PORT: val.coerce.number().int().min(1).max(65535),
      DEBUG: val.coerce.boolean().default(false),
      ORIGINS: val.string().transform((text) => text.split(",")),
    });
    expect(valueOf(env.validate({ PORT: "8080", ORIGINS: "a,b" }))).toEqual({
      PORT: 8080,
      DEBUG: false,
      ORIGINS: ["a", "b"],
    });
  });
});
