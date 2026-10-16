import { Buffer } from "node:buffer";
import { createHash, randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { digestKey, encodeBase64Url, randomToken, sha256, timingSafeEqual } from "./encoding";

describe("encodeBase64Url", () => {
  it("shouldEncodeEmptyInputAsEmptyString", () => {
    expect(encodeBase64Url(new Uint8Array())).toBe("");
  });

  it("shouldUseUrlAlphabetWithoutPadding", () => {
    // 0xfb 0xff encodes to "+/8=" in base64; base64url must give "-_8" with no padding.
    expect(encodeBase64Url(new Uint8Array([0xfb, 0xff]))).toBe("-_8");
  });

  it("shouldMatchNodeBase64UrlForEveryLengthModuloThree", () => {
    for (let length = 0; length < 40; length += 1) {
      const bytes = randomBytes(length);
      expect(encodeBase64Url(new Uint8Array(bytes))).toBe(bytes.toString("base64url"));
    }
  });
});

describe("randomToken", () => {
  it("shouldReturn43Base64UrlCharacters", () => {
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("shouldReturnDifferentValuesOnEachCall", () => {
    expect(randomToken()).not.toBe(randomToken());
  });
});

describe("sha256", () => {
  it("shouldHashUtf8BytesOfText", async () => {
    const expected = createHash("sha256").update("héllo", "utf8").digest();
    expect(Buffer.from(await sha256("héllo"))).toEqual(expected);
  });
});

describe("digestKey", () => {
  it("shouldReturnBase64UrlOfSha256", async () => {
    const expected = createHash("sha256").update("code-value", "utf8").digest("base64url");
    expect(await digestKey("code-value")).toBe(expected);
  });
});

describe("timingSafeEqual", () => {
  it("shouldReturnTrueForEqualStrings", () => {
    expect(timingSafeEqual("abc123", "abc123")).toBe(true);
  });

  it("shouldReturnFalseForSameLengthDifferentStrings", () => {
    expect(timingSafeEqual("abc123", "abc124")).toBe(false);
  });

  it("shouldReturnFalseWhenOnlyTheFirstByteDiffers", () => {
    expect(timingSafeEqual("xbc", "abc")).toBe(false);
  });

  it("shouldReturnFalseForDifferentLengths", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });

  it("shouldCompareUtf8BytesNotCharacters", () => {
    // "é" and "ab" are both two UTF-8 bytes, so this compares equal-length byte sequences that differ.
    expect(timingSafeEqual("é", "ab")).toBe(false);
    expect(timingSafeEqual("é", "é")).toBe(true);
  });

  it("shouldReturnTrueForEmptyStrings", () => {
    expect(timingSafeEqual("", "")).toBe(true);
  });
});
