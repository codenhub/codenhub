import { describe, expect, it } from "vitest";

import { computeCodeChallenge, isCodeChallenge, isCodeVerifier } from "./pkce";

const RFC_7636_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const RFC_7636_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

describe("computeCodeChallenge", () => {
  it("shouldMatchRfc7636AppendixBVector", async () => {
    expect(await computeCodeChallenge(RFC_7636_VERIFIER)).toBe(RFC_7636_CHALLENGE);
  });
});

describe("isCodeVerifier", () => {
  it("shouldAcceptRfcVerifier", () => {
    expect(isCodeVerifier(RFC_7636_VERIFIER)).toBe(true);
  });

  it("shouldAcceptLengthOf43", () => {
    expect(isCodeVerifier("a".repeat(43))).toBe(true);
  });

  it("shouldAcceptLengthOf128", () => {
    expect(isCodeVerifier("a".repeat(128))).toBe(true);
  });

  it("shouldRejectLengthOf42", () => {
    expect(isCodeVerifier("a".repeat(42))).toBe(false);
  });

  it("shouldRejectLengthOf129", () => {
    expect(isCodeVerifier("a".repeat(129))).toBe(false);
  });

  it("shouldRejectCharactersOutsideUnreservedSet", () => {
    expect(isCodeVerifier(`${"a".repeat(42)}+`)).toBe(false);
    expect(isCodeVerifier(`${"a".repeat(42)}=`)).toBe(false);
    expect(isCodeVerifier(`${"a".repeat(42)} `)).toBe(false);
  });

  it("shouldAcceptUnreservedPunctuation", () => {
    expect(isCodeVerifier(`${"a".repeat(40)}-._~`)).toBe(true);
  });

  it("shouldRejectNonStrings", () => {
    expect(isCodeVerifier(undefined)).toBe(false);
    expect(isCodeVerifier(43)).toBe(false);
    expect(isCodeVerifier(["a".repeat(43)])).toBe(false);
  });
});

describe("isCodeChallenge", () => {
  it("shouldAcceptRfcChallenge", () => {
    expect(isCodeChallenge(RFC_7636_CHALLENGE)).toBe(true);
  });

  it("shouldRejectLengthOf42", () => {
    expect(isCodeChallenge("a".repeat(42))).toBe(false);
  });

  it("shouldRejectLengthOf44", () => {
    expect(isCodeChallenge("a".repeat(44))).toBe(false);
  });

  it("shouldRejectPaddingCharacter", () => {
    expect(isCodeChallenge(`${"a".repeat(42)}=`)).toBe(false);
  });

  it("shouldRejectNonStrings", () => {
    expect(isCodeChallenge(null)).toBe(false);
  });
});
