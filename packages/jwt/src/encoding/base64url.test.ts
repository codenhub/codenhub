import { describe, expect, it } from "vitest";

import { decodeBase64Url, encodeBase64Url, isBase64Url } from "./base64url";

const bytesOf = (...values: number[]): Uint8Array => new Uint8Array(values);

describe("encodeBase64Url", () => {
  it("should encode without padding, using - and _", () => {
    expect(encodeBase64Url(bytesOf(0xfb, 0xff))).toBe("-_8");
  });

  it("should encode every final group length", () => {
    expect(
      ["", "f", "fo", "foo", "foob", "fooba", "foobar"].map((text) => encodeBase64Url(new TextEncoder().encode(text))),
    ).toEqual(["", "Zg", "Zm8", "Zm9v", "Zm9vYg", "Zm9vYmE", "Zm9vYmFy"]);
  });

  it("should round-trip every byte value", () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);

    expect(decodeBase64Url(encodeBase64Url(bytes))).toEqual(bytes);
  });
});

describe("decodeBase64Url", () => {
  it("should decode canonical text", () => {
    expect(decodeBase64Url("Zm9vYmE")).toEqual(new TextEncoder().encode("fooba"));
  });

  it("should decode the empty string to no bytes", () => {
    expect(decodeBase64Url("")).toEqual(new Uint8Array(0));
  });

  it("should decode - and _ as 62 and 63", () => {
    expect(decodeBase64Url("-_8")).toEqual(bytesOf(0xfb, 0xff));
  });

  it("should reject padding", () => {
    expect(decodeBase64Url("Zg==")).toBeUndefined();
    expect(decodeBase64Url("Zm8=")).toBeUndefined();
  });

  it("should reject the standard alphabet's + and /", () => {
    expect(decodeBase64Url("+/8")).toBeUndefined();
  });

  it("should reject whitespace and other characters", () => {
    expect(decodeBase64Url("Zm9v Yg")).toBeUndefined();
    expect(decodeBase64Url("Zm9v\nYg")).toBeUndefined();
    expect(decodeBase64Url("Zm9vé")).toBeUndefined();
  });

  it("should reject a length one more than a multiple of four, which encodes no whole byte", () => {
    expect(decodeBase64Url("Z")).toBeUndefined();
    expect(decodeBase64Url("Zm9vY")).toBeUndefined();
  });

  it("should reject non-zero spare bits after one byte", () => {
    // "Zg" is "f"; "Zh" through "Zv" set some of the 4 spare bits.
    expect(decodeBase64Url("Zh")).toBeUndefined();
    expect(decodeBase64Url("Zv")).toBeUndefined();
  });

  it("should reject non-zero spare bits after two bytes", () => {
    // "Zm8" is "fo"; "Zm9" sets one of the 2 spare bits.
    expect(decodeBase64Url("Zm9")).toBeUndefined();
  });
});

describe("isBase64Url", () => {
  it("should agree with decodeBase64Url on canonical and non-canonical text", () => {
    expect(["", "Zg", "Zm8", "Zm9v", "-_8"].every(isBase64Url)).toBe(true);
    expect(["Z", "Zh", "Zm9", "Zg==", "+/8", "a.b"].some(isBase64Url)).toBe(false);
  });
});
