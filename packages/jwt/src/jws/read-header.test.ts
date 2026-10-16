import { describe, expect, it } from "vitest";

import { encodeBase64Url } from "../encoding/base64url";
import { readHeader } from "./read-header";

const segment = (json: string): string => encodeBase64Url(new TextEncoder().encode(json));
const HEADER = segment('{"alg":"EdDSA","kid":"k1","typ":"JWT"}');
const TOKEN = `${HEADER}.${segment('{"sub":"user-1"}')}.${encodeBase64Url(new Uint8Array(64))}`;

const failure = (issue: object) => ({ ok: false, error: { issues: [issue] } });

describe("readHeader", () => {
  it("should return the frozen header", () => {
    const result = readHeader(TOKEN);

    expect(result).toEqual({ ok: true, value: { alg: "EdDSA", kid: "k1", typ: "JWT" } });
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.ok && Object.isFrozen(result.value)).toBe(true);
  });

  it("should return only the header, never the payload", () => {
    expect(JSON.stringify(readHeader(TOKEN))).not.toContain("user-1");
  });

  it("should not decode the payload", () => {
    const token = `${HEADER}.${segment('{"a":1,"a":2}')}.${encodeBase64Url(new Uint8Array(64))}`;

    expect(readHeader(token).ok).toBe(true);
  });

  it("should reject a payload segment that is not base64url", () => {
    expect(readHeader(`${HEADER}.a+b.${encodeBase64Url(new Uint8Array(64))}`)).toEqual(
      failure({ code: "malformed", path: ["payload"] }),
    );
  });

  it("should reject a value that is not a string without throwing", () => {
    expect(readHeader(undefined)).toEqual(failure({ code: "malformed" }));
    expect(readHeader({ toString: () => TOKEN })).toEqual(failure({ code: "malformed" }));
  });

  it("should reject a token longer than 8192 characters by default", () => {
    expect(readHeader("a".repeat(8193))).toEqual(
      failure({ code: "too_large", params: { limit: "length", maximum: 8192 } }),
    );
  });

  it("should apply the maxLength option", () => {
    expect(readHeader(TOKEN, { maxLength: TOKEN.length - 1 })).toEqual(
      failure({ code: "too_large", params: { limit: "length", maximum: TOKEN.length - 1 } }),
    );
  });

  it("should accept a maxLength up to 65536", () => {
    expect(readHeader(TOKEN, { maxLength: 65_536 }).ok).toBe(true);
  });

  it("should reject alg none", () => {
    expect(readHeader(`${segment('{"alg":"none"}')}.${segment("{}")}.AA`)).toEqual(
      failure({ code: "unsupported_alg", path: ["header", "alg"] }),
    );
  });

  it.each([0, 65_537, 1.5, Number.NaN, Number.POSITIVE_INFINITY, -1, "100", null])(
    "should throw a TypeError for maxLength %s",
    (maxLength) => {
      expect(() => readHeader(TOKEN, { maxLength: maxLength as number })).toThrow(
        new TypeError("maxLength must be an integer from 1 through 65536"),
      );
    },
  );

  it.each([null, "8192", 8192])("should throw a TypeError for options %s", (options) => {
    expect(() => readHeader(TOKEN, options as never)).toThrow(new TypeError("readHeader options must be an object"));
  });

  it("should check options even when the token is not a string", () => {
    expect(() => readHeader(42, { maxLength: 0 })).toThrow(TypeError);
  });
});
