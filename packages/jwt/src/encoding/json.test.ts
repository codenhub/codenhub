import { describe, expect, it } from "vitest";

import { parseJsonObject } from "./json";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
const parse = (text: string) => parseJsonObject(encode(text));

const MALFORMED = { ok: false, error: { issues: [{ code: "malformed" }] } };
const DUPLICATE_KEY = { ok: false, error: { issues: [{ code: "duplicate_key" }] } };
const TOO_DEEP = { ok: false, error: { issues: [{ code: "too_large", params: { limit: "depth", maximum: 32 } }] } };

/** An object holding `levels` containers in all, the top-level object included. */
const nested = (levels: number): string => `{"a":${"[".repeat(levels - 1)}${"]".repeat(levels - 1)}}`;

describe("parseJsonObject", () => {
  it("should parse an object as JSON.parse does", () => {
    const text = '{"alg":"ES256","n":[1,-2.5e3,true,false,null,{"x":""}],"e":{}}';

    expect(parse(text)).toEqual({ ok: true, value: JSON.parse(text) });
  });

  it("should deep-freeze the parsed object", () => {
    const result = parse('{"a":{"b":[{}]}}');

    expect(result.ok && Object.isFrozen(result.value)).toBe(true);
    expect(result.ok && Object.isFrozen((result.value["a"] as { b: object[] }).b[0])).toBe(true);
  });

  it("should give parsed objects Object.prototype, as JSON.parse does", () => {
    const result = parse('{"a":{}}');

    expect(result.ok && Object.getPrototypeOf(result.value["a"])).toBe(Object.prototype);
  });

  it("should put the issue at the given path", () => {
    expect(parseJsonObject(encode("{"), ["header"])).toEqual({
      ok: false,
      error: { issues: [{ code: "malformed", path: ["header"] }] },
    });
  });

  describe("numbers", () => {
    const corpus = [
      "0",
      "-0",
      "1",
      "-1",
      "123456789012345678901234567890",
      "0.1",
      "1.5e10",
      "1E10",
      "1e+2",
      "1e-2",
      "2.2250738585072014e-308",
      "4.9e-324",
      "5e-325",
      "1.7976931348623157e308",
      "1e400",
      "-1e400",
      "9007199254740993",
      "0.30000000000000004",
      "1.00000000000000011102230246251565404236316680908203125",
    ];

    it.each(corpus)("should parse %s to the number JSON.parse returns", (lexeme) => {
      const result = parse(`{"n":${lexeme}}`);

      expect(result.ok && Object.is(result.value["n"], JSON.parse(lexeme))).toBe(true);
    });

    it.each(["01", "+1", ".5", "1.", "1e", "1e+", "-", "0x10", "NaN", "Infinity", "1_000", "--1"])(
      "should reject the number %s, as JSON.parse does",
      (lexeme) => {
        expect(() => JSON.parse(`{"n":${lexeme}}`)).toThrow(SyntaxError);
        expect(parse(`{"n":${lexeme}}`)).toEqual(MALFORMED);
      },
    );
  });

  describe("strings", () => {
    it("should decode every escape as JSON.parse does", () => {
      const text = String.raw`{"s":"\" \\ \/ \b \f \n \r \t A é 😀"}`;

      expect(parse(text)).toEqual({ ok: true, value: JSON.parse(text) });
    });

    it("should keep lone surrogate escapes, as JSON.parse does", () => {
      const text = String.raw`{"s":"\uD800 \uDFFF"}`;

      expect(parse(text)).toEqual({ ok: true, value: { s: "\uD800 \uDFFF" } });
    });

    it("should keep non-ASCII characters", () => {
      expect(parse('{"s":"ação 😀"}')).toEqual({ ok: true, value: { s: "ação 😀" } });
    });

    it.each([
      ["an unknown escape", String.raw`{"s":"\x41"}`],
      ["a short unicode escape", String.raw`{"s":"\u41"}`],
      ["a non-hex unicode escape", String.raw`{"s":"\u00G0"}`],
      ["a raw control character", '{"s":"a\tb"}'],
      ["an unterminated string", '{"s":"abc'],
      ["a backslash at the end", '{"s":"abc\\'],
      ["a single-quoted string", "{'s':'a'}"],
    ])("should reject %s", (_, text) => {
      expect(parse(text)).toEqual(MALFORMED);
    });
  });

  describe("syntax", () => {
    it("should accept the four JSON whitespace characters anywhere between tokens", () => {
      expect(parse(' \t\n\r{ "a" : [ 1 , 2 ] }\r\n\t ')).toEqual({ ok: true, value: { a: [1, 2] } });
    });

    it.each([
      ["an empty input", ""],
      ["only whitespace", "  "],
      ["a trailing comma in an object", '{"a":1,}'],
      ["a trailing comma in an array", '{"a":[1,]}'],
      ["a missing colon", '{"a" 1}'],
      ["a missing comma", '{"a":1 "b":2}'],
      ["an unquoted name", "{a:1}"],
      ["a name that is not a string", "{1:1}"],
      ["an unclosed object", '{"a":1'],
      ["an unclosed array", '{"a":[1'],
      ["a mismatched bracket", '{"a":[1}'],
      ["text after the object", '{"a":1}x'],
      ["a second object", "{}{}"],
      ["a misspelled literal", '{"a":tru}'],
      ["a capitalized literal", '{"a":True}'],
      ["a comment", '{"a":1/* c */}'],
      ["a non-breaking space as whitespace", '{ "a":1}'],
    ])("should reject %s", (_, text) => {
      expect(parse(text)).toEqual(MALFORMED);
    });

    it.each([
      ["an array", "[]"],
      ["a string", '"a"'],
      ["a number", "1"],
      ["null", "null"],
      ["true", "true"],
    ])("should reject %s at the top level", (_, text) => {
      expect(parse(text)).toEqual(MALFORMED);
    });
  });

  describe("encoding", () => {
    it("should reject invalid UTF-8", () => {
      expect(parseJsonObject(new Uint8Array([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]))).toEqual(
        MALFORMED,
      );
    });

    it("should reject an overlong UTF-8 encoding", () => {
      expect(parseJsonObject(new Uint8Array([0x7b, 0x22, 0xc0, 0xaf, 0x22, 0x3a, 0x31, 0x7d]))).toEqual(MALFORMED);
    });

    it("should reject a UTF-8 encoded surrogate", () => {
      expect(parseJsonObject(new Uint8Array([0x7b, 0x22, 0xed, 0xa0, 0x80, 0x22, 0x3a, 0x31, 0x7d]))).toEqual(
        MALFORMED,
      );
    });

    it("should reject a leading byte order mark", () => {
      expect(parseJsonObject(new Uint8Array([0xef, 0xbb, 0xbf, ...encode("{}")]))).toEqual(MALFORMED);
    });
  });

  describe("duplicate member names", () => {
    it("should reject a repeated name at the top level", () => {
      expect(parse('{"a":1,"a":1}')).toEqual(DUPLICATE_KEY);
    });

    it("should reject a repeated name in a nested object", () => {
      expect(parse('{"a":{"b":[{"c":1,"c":2}]}}')).toEqual(DUPLICATE_KEY);
    });

    it("should reject names that are equal once their escapes are decoded", () => {
      expect(parse(String.raw`{"a":1,"a":2}`)).toEqual(DUPLICATE_KEY);
    });

    it("should reject a repeated __proto__", () => {
      expect(parse('{"__proto__":1,"__proto__":2}')).toEqual(DUPLICATE_KEY);
    });

    it("should accept the same name in sibling objects", () => {
      expect(parse('{"a":{"x":1},"b":{"x":2}}')).toEqual({ ok: true, value: { a: { x: 1 }, b: { x: 2 } } });
    });

    it("should not treat an inherited member as a repeat", () => {
      expect(parse('{"toString":1,"constructor":2}')).toEqual({ ok: true, value: { toString: 1, constructor: 2 } });
    });
  });

  describe("__proto__", () => {
    it("should make __proto__ an own data member, as JSON.parse does", () => {
      const text = '{"__proto__":{"polluted":true}}';
      const result = parse(text);

      expect(result.ok && Object.hasOwn(result.value, "__proto__")).toBe(true);
      expect(result.ok && Object.getPrototypeOf(result.value)).toBe(Object.prototype);
      expect(result.ok && (result.value as { polluted?: boolean }).polluted).toBeUndefined();
      expect(result.ok && Object.getOwnPropertyDescriptor(result.value, "__proto__")).toEqual(
        Object.getOwnPropertyDescriptor(Object.freeze(JSON.parse(text)), "__proto__"),
      );
    });

    it("should not pollute Object.prototype through a nested __proto__", () => {
      parse('{"a":{"__proto__":{"polluted":true}}}');

      expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    });
  });

  describe("depth", () => {
    it("should accept nesting exactly 32 deep", () => {
      expect(parse(nested(32)).ok).toBe(true);
    });

    it("should reject nesting 33 deep", () => {
      expect(parse(nested(33))).toEqual(TOO_DEEP);
    });

    it("should count objects and arrays alike", () => {
      const objects = `${'{"a":'.repeat(32)}{}${"}".repeat(32)}`;

      expect(parse(objects)).toEqual(TOO_DEEP);
    });

    it("should reject 100,000 open brackets without overflowing the stack", () => {
      expect(parse(`{"a":${"[".repeat(100_000)}`)).toEqual(TOO_DEEP);
    });

    it("should reject 100,000 balanced brackets cheaply", () => {
      const started = performance.now();

      expect(parse(`{"a":${"[".repeat(100_000)}${"]".repeat(100_000)}}`)).toEqual(TOO_DEEP);
      expect(performance.now() - started).toBeLessThan(1000);
    });
  });

  describe("cost", () => {
    it("should parse many members in linear time", () => {
      const members = Array.from({ length: 50_000 }, (_, index) => `"k${index}":${index}`).join(",");
      const started = performance.now();

      const result = parse(`{${members}}`);

      expect(result.ok && Object.keys(result.value)).toHaveLength(50_000);
      expect(performance.now() - started).toBeLessThan(2000);
    });

    it("should parse a long string with many escapes", () => {
      const text = `{"s":"${String.raw`\n`.repeat(100_000)}"}`;

      expect(parse(text)).toEqual({ ok: true, value: JSON.parse(text) });
    });
  });

  it("should never echo the input in a failure", () => {
    const secret = "s3cr3t-value";
    const failures = [
      parse(`{"${secret}":1,"${secret}":2}`),
      parse(`{"a":"${secret}`),
      parse(`{"a":${secret}}`),
      parse(`["${secret}"]`),
    ];

    for (const failure of failures) {
      expect(failure.ok).toBe(false);
      expect(JSON.stringify(failure)).not.toContain(secret);
    }
  });
});
