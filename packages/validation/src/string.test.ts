import { describe, expect, it } from "vitest";

import { val } from "./index";
import { codesOf, issuesOf, messagesOf, valueOf } from "./test-utils";

const accepts = (schema: { validate(input: unknown): { ok: boolean } }, ...inputs: unknown[]) =>
  inputs.map((input) => schema.validate(input).ok);

describe("string", () => {
  it("accepts strings and rejects everything else, naming the received type", () => {
    expect(valueOf(val.string().validate("a"))).toBe("a");
    expect(messagesOf(val.string().validate(1))).toEqual(["Expected string, received number"]);
    expect(messagesOf(val.string().validate(null))).toEqual(["Expected string, received null"]);
    expect(codesOf(val.string().validate(undefined))).toEqual(["invalid_type"]);
  });

  it("uses a custom message for the type failure", () => {
    expect(messagesOf(val.string("text please").validate(1))).toEqual(["text please"]);
  });

  it("never puts the received value into a message", () => {
    expect(messagesOf(val.string().email().validate("hunter2")).join()).not.toContain("hunter2");
    expect(messagesOf(val.string().min(20).validate("hunter2")).join()).not.toContain("hunter2");
  });
});

describe("length rules", () => {
  it("min and max are inclusive", () => {
    expect(accepts(val.string().min(2), "a", "ab", "abc")).toEqual([false, true, true]);
    expect(accepts(val.string().max(2), "a", "ab", "abc")).toEqual([true, true, false]);
  });

  it("length is exact and reports which side failed", () => {
    const schema = val.string().length(3);
    expect(codesOf(schema.validate("ab"))).toEqual(["too_small"]);
    expect(codesOf(schema.validate("abcd"))).toEqual(["too_big"]);
    expect(schema.validate("abc").ok).toBe(true);
  });

  it("nonEmpty rejects the empty string but not whitespace", () => {
    expect(accepts(val.string().nonEmpty(), "", " ", "a")).toEqual([false, true, true]);
  });

  it("carries the limit in params so messages can be built from it", () => {
    expect(issuesOf(val.string().min(3).validate("a"))[0]?.params).toEqual({ minimum: 3, type: "string" });
  });

  it("accepts a message function that reads params", () => {
    const schema = val.string().min(3, ({ params }) => `at least ${params?.minimum}`);
    expect(messagesOf(schema.validate("a"))).toEqual(["at least 3"]);
  });

  it("rejects an invalid limit when the schema is built, not when input arrives", () => {
    expect(() => val.string().min(-1)).toThrow(RangeError);
    expect(() => val.string().max(1.5)).toThrow(RangeError);
    expect(() => val.string().length(Number.NaN)).toThrow(RangeError);
  });
});

describe("email", () => {
  const email = val.string().email();

  it("accepts ordinary addresses and leaves them unchanged", () => {
    expect(valueOf(email.validate("Me.Name+tag@Example.COM"))).toBe("Me.Name+tag@Example.COM");
  });

  it("rejects malformed addresses", () => {
    expect(
      accepts(
        email,
        "plain",
        "@example.com",
        "a@",
        "a@@example.com",
        "a b@example.com",
        "a@localhost",
        "a@example",
        " a@example.com",
      ),
    ).toEqual([false, false, false, false, false, false, false, false]);
  });

  it("rejects overlong parts", () => {
    expect(email.validate(`${"a".repeat(65)}@example.com`).ok).toBe(false);
    expect(email.validate(`a@${"b".repeat(250)}.com`).ok).toBe(false);
  });

  it("can forbid plus addressing", () => {
    expect(val.string().email({ allowPlus: false }).validate("a+b@example.com").ok).toBe(false);
  });

  it("takes a custom message in its options", () => {
    expect(messagesOf(val.string().email({ message: "bad email" }).validate("x"))).toEqual(["bad email"]);
  });
});

describe("url", () => {
  const url = val.string().url();

  it("accepts absolute http and https URLs with public hosts, unchanged", () => {
    expect(valueOf(url.validate("https://Example.com/a?b=1#c"))).toBe("https://Example.com/a?b=1#c");
    expect(url.validate("http://sub.example.co.uk").ok).toBe(true);
  });

  it("rejects input that is not an absolute URL, without guessing a scheme", () => {
    expect(accepts(url, "example.com", "//example.com", "not a url", "")).toEqual([false, false, false, false]);
  });

  it("rejects other protocols, embedded credentials and non-public hosts", () => {
    expect(
      accepts(
        url,
        "ftp://example.com",
        "javascript:alert(1)",
        "https://user:pw@example.com",
        "http://localhost:3000",
        "http://127.0.0.1",
        "http://intranet",
      ),
    ).toEqual([false, false, false, false, false, false]);
  });

  it("accepts local hosts with allowLocal", () => {
    const local = val.string().url({ allowLocal: true });
    expect(accepts(local, "http://localhost:3000", "http://127.0.0.1", "http://[::1]:8080")).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("accepts other protocols when listed", () => {
    expect(
      val
        .string()
        .url({ protocols: ["ftp"] })
        .validate("ftp://example.com").ok,
    ).toBe(true);
    expect(
      val
        .string()
        .url({ protocols: ["ftp"] })
        .validate("https://example.com").ok,
    ).toBe(false);
  });
});

describe("identifiers", () => {
  it("uuid accepts versions 1 to 8 in hyphenated form", () => {
    const schema = val.string().uuid();
    expect(accepts(schema, "123e4567-e89b-12d3-a456-426614174000", "550e8400-e29b-41d4-a716-446655440000")).toEqual([
      true,
      true,
    ]);
    expect(
      accepts(schema, "123e4567e89b12d3a456426614174000", "not-a-uuid", "123e4567-e89b-92d3-a456-426614174000"),
    ).toEqual([false, false, false]);
  });

  it("ulid, nanoid and cuid2", () => {
    expect(
      accepts(
        val.string().ulid(),
        "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        "01arz3ndektsv4rrffq69g5fav",
        "01ARZ3NDEKTSV4RRFFQ69G5FAU!",
      ),
    ).toEqual([true, true, false]);
    expect(accepts(val.string().nanoid(), "V1StGXR8_Z5jdHi6B-myT", "short")).toEqual([true, false]);
    expect(accepts(val.string().cuid2(), "tz4a98xxat96iws9zmbrgj3a", "1bad")).toEqual([true, false]);
  });
});

describe("network formats", () => {
  it("ip accepts both families by default and can be narrowed", () => {
    expect(accepts(val.string().ip(), "192.168.0.1", "::1", "2001:db8::ff00:42:8329", "256.1.1.1", "nope")).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(accepts(val.string().ip({ version: "v4" }), "192.168.0.1", "::1")).toEqual([true, false]);
    expect(accepts(val.string().ip({ version: "v6" }), "192.168.0.1", "::1")).toEqual([false, true]);
    expect(messagesOf(val.string().ip({ version: "v4" }).validate("x"))).toEqual(["Invalid IPv4 address"]);
  });

  it("hostname accepts single labels and rejects malformed ones", () => {
    expect(accepts(val.string().hostname(), "localhost", "a.example.com", "-bad.com", "bad-.com", "a..b", "")).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
  });
});

describe("dates and times", () => {
  it("datetime accepts ISO 8601 with Z, and rejects days that do not exist", () => {
    const schema = val.string().datetime();
    expect(
      accepts(
        schema,
        "2026-09-28T14:30:00Z",
        "2026-09-28T14:30:00.123Z",
        "2026-02-30T00:00:00Z",
        "2026-09-28T25:00:00Z",
        "2026-09-28",
        "2026-09-28T14:30:00+02:00",
      ),
    ).toEqual([true, true, false, false, false, false]);
  });

  it("datetime accepts offsets and constrains precision when asked", () => {
    expect(val.string().datetime({ offset: true }).validate("2026-09-28T14:30:00+02:00").ok).toBe(true);
    expect(
      accepts(
        val.string().datetime({ precision: 3 }),
        "2026-09-28T14:30:00.123Z",
        "2026-09-28T14:30:00Z",
        "2026-09-28T14:30:00.1Z",
      ),
    ).toEqual([true, false, false]);
    expect(accepts(val.string().datetime({ precision: 0 }), "2026-09-28T14:30:00Z", "2026-09-28T14:30:00.1Z")).toEqual([
      true,
      false,
    ]);
  });

  it("datetime rejects a precision that is not a non-negative integer when the schema is built", () => {
    for (const precision of [-1, 1.5, Number.NaN]) {
      expect(() => val.string().datetime({ precision })).toThrow(RangeError);
    }
  });

  it("date accepts calendar dates that exist", () => {
    expect(accepts(val.string().date(), "2026-09-28", "2024-02-29", "2026-02-29", "2026-13-01", "26-09-28")).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
  });
});

describe("encodings", () => {
  it("base64 requires correct padding", () => {
    expect(accepts(val.string().base64(), "aGVsbG8=", "aGVsbG8", "!!!!")).toEqual([true, false, false]);
  });

  it("hex accepts digits of any case", () => {
    expect(accepts(val.string().hex(), "deadBEEF01", "xyz", "")).toEqual([true, false, false]);
  });
});

describe("text rules", () => {
  it("regex tests the pattern and ignores stateful flags", () => {
    const schema = val.string().regex(/^a/g);
    expect(accepts(schema, "abc", "abc", "abc", "xbc")).toEqual([true, true, true, false]);
    expect(messagesOf(val.string().regex(/^a/, "starts with a").validate("b"))).toEqual(["starts with a"]);
  });

  it("startsWith, endsWith and includes", () => {
    expect(accepts(val.string().startsWith("ab"), "abc", "cab")).toEqual([true, false]);
    expect(accepts(val.string().endsWith("bc"), "abc", "bca")).toEqual([true, false]);
    expect(accepts(val.string().includes("b"), "abc", "xyz")).toEqual([true, false]);
  });
});

describe("transforms", () => {
  it("trim, toLowerCase and toUpperCase change the output", () => {
    expect(valueOf(val.string().trim().validate("  a  "))).toBe("a");
    expect(valueOf(val.string().toLowerCase().validate("AbC"))).toBe("abc");
    expect(valueOf(val.string().toUpperCase().validate("AbC"))).toBe("ABC");
  });

  it("apply to the rules that come after them, in order", () => {
    expect(val.string().trim().min(3).validate("  ab  ").ok).toBe(false);
    expect(val.string().min(3).trim().validate("  ab  ").ok).toBe(true);
    expect(
      val
        .string()
        .toLowerCase()
        .regex(/^[a-z]+$/)
        .validate("ABC").ok,
    ).toBe(true);
  });

  it("rules never modify the value", () => {
    expect(valueOf(val.string().email().min(1).regex(/@/).validate("A@B.co"))).toBe("A@B.co");
  });
});
