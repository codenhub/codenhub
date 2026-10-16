import { describe, expect, it } from "vitest";

import {
  createKeySet,
  createVerifier,
  importPrivateKey,
  importPublicKey,
  importSecretKey,
  type AsymmetricAlgorithm,
  type JwtResult,
  type SigningKey,
  type VerificationKey,
} from "../../src";
import { ALGORITHM_PARAMS } from "../../src/keys/algorithms";
import { getKeyEntry } from "../../src/keys/registry";
import {
  RFC7515_A1_JWK,
  RFC7515_A1_TOKEN,
  RFC7515_A2_JWK,
  RFC7515_A2_TOKEN,
  RFC7515_A3_JWK,
  RFC7515_A3_TOKEN,
  RFC7520_HMAC_JWK,
  RFC7520_HS256_TOKEN,
  RFC7520_PS384_TOKEN,
  RFC7520_RS256_TOKEN,
  RFC7520_RSA_PRIVATE_JWK,
  RFC7520_RSA_PUBLIC_JWK,
  RFC8037_PRIVATE_JWK,
  RFC8037_SIGNATURE_HEX,
  RFC8037_TOKEN,
} from "./fixtures/rfc-vectors";
import { failure, flipSignatureBit } from "./support";

// The RFC 7515 examples expire at 1300819380 (2011-03-22T18:43:00Z); they are checked just before.
const BEFORE_RFC7515_EXP = () => 1_300_819_000 * 1000;
const AFTER_RFC7515_EXP = () => 1_300_819_380 * 1000;

const RFC7515_PAYLOAD = { iss: "joe", exp: 1_300_819_380, "http://example.com/is_root": true };

const PRIVATE_MEMBERS = new Set(["d", "p", "q", "dp", "dq", "qi"]);

const publicPart = (jwk: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(jwk).filter(([name]) => !PRIVATE_MEMBERS.has(name)));

const valueOf = <T>(result: JwtResult<T>): T => {
  if (!result.ok) {
    throw new Error(`expected ok, got ${JSON.stringify(result.error.issues)}`);
  }
  return result.value;
};

const publicKeyOf = async (jwk: Record<string, unknown>, alg: AsymmetricAlgorithm) =>
  valueOf(await importPublicKey(publicPart(jwk), { alg }));

const verifierFor = (key: VerificationKey, now?: () => number) =>
  createVerifier({ keys: createKeySet([key]), ...(now === undefined ? {} : { now }) });

/** Signs the exact signing input of an RFC token with a key imported here, bypassing the JSON-only `sign`. */
async function signatureHexFor(key: SigningKey, token: string): Promise<string> {
  const signingInput = token.slice(0, token.lastIndexOf("."));
  const signature = await crypto.subtle.sign(
    ALGORITHM_PARAMS[key.alg].signParams,
    getKeyEntry(key).cryptoKey,
    new TextEncoder().encode(signingInput),
  );
  return Buffer.from(signature).toString("hex");
}

const signatureHexOf = (token: string): string =>
  Buffer.from(token.slice(token.lastIndexOf(".") + 1), "base64url").toString("hex");

describe("RFC 7515 Appendix A.1 (HS256)", () => {
  it("should verify the A.1 token with the A.1 key before its exp", async () => {
    const key = valueOf(await importSecretKey(RFC7515_A1_JWK, { alg: "HS256" }));

    expect(await verifierFor(key, BEFORE_RFC7515_EXP)(RFC7515_A1_TOKEN)).toEqual({
      ok: true,
      value: { header: { typ: "JWT", alg: "HS256" }, payload: RFC7515_PAYLOAD, key },
    });
  });

  it("should report the A.1 token expired at its exp", async () => {
    const key = valueOf(await importSecretKey(RFC7515_A1_JWK, { alg: "HS256" }));

    expect(await verifierFor(key, AFTER_RFC7515_EXP)(RFC7515_A1_TOKEN)).toEqual(
      failure({ code: "expired", path: ["payload", "exp"] }),
    );
  });

  it("should reproduce the A.1 signature byte for byte", async () => {
    const key = valueOf(await importSecretKey(RFC7515_A1_JWK, { alg: "HS256" }));

    expect(await signatureHexFor(key, RFC7515_A1_TOKEN)).toBe(signatureHexOf(RFC7515_A1_TOKEN));
  });
});

describe("RFC 7515 Appendix A.2 (RS256)", () => {
  it("should verify the A.2 token with the public part of the A.2 key", async () => {
    const key = await publicKeyOf(RFC7515_A2_JWK, "RS256");

    expect(await verifierFor(key, BEFORE_RFC7515_EXP)(RFC7515_A2_TOKEN)).toEqual({
      ok: true,
      value: { header: { alg: "RS256" }, payload: RFC7515_PAYLOAD, key },
    });
  });

  it("should reproduce the A.2 signature byte for byte with the imported private key", async () => {
    const key = valueOf(await importPrivateKey(RFC7515_A2_JWK, { alg: "RS256" }));

    expect(await signatureHexFor(key, RFC7515_A2_TOKEN)).toBe(signatureHexOf(RFC7515_A2_TOKEN));
  });

  it("should reject the A.2 token for the A.2 key bound to PS256", async () => {
    const key = await publicKeyOf(RFC7515_A2_JWK, "PS256");

    expect(await verifierFor(key, BEFORE_RFC7515_EXP)(RFC7515_A2_TOKEN)).toEqual(failure({ code: "no_matching_key" }));
  });
});

describe("RFC 7515 Appendix A.3 (ES256)", () => {
  it("should verify the A.3 token with the public part of the A.3 key", async () => {
    const key = await publicKeyOf(RFC7515_A3_JWK, "ES256");

    expect(await verifierFor(key, BEFORE_RFC7515_EXP)(RFC7515_A3_TOKEN)).toEqual({
      ok: true,
      value: { header: { alg: "ES256" }, payload: RFC7515_PAYLOAD, key },
    });
  });

  it("should reject the A.3 token with one signature bit flipped", async () => {
    const key = await publicKeyOf(RFC7515_A3_JWK, "ES256");

    expect(await verifierFor(key, BEFORE_RFC7515_EXP)(flipSignatureBit(RFC7515_A3_TOKEN))).toEqual(
      failure({ code: "bad_signature" }),
    );
  });
});

// RFC 7520 signs a plain-text payload (Figure 7). The signature verifies; a JWT verifier then rejects the
// payload as not a JSON object. A flipped bit shows the signature is what the first case got past.
describe("RFC 7520 Section 4.1 (RS256)", () => {
  it("should verify the 4.1 signature, then reject its plain-text payload as malformed", async () => {
    const key = valueOf(await importPublicKey(RFC7520_RSA_PUBLIC_JWK, { alg: "RS256" }));

    expect(await verifierFor(key)(RFC7520_RS256_TOKEN)).toEqual(failure({ code: "malformed", path: ["payload"] }));
  });

  it("should report bad_signature, not malformed, for the 4.1 token with one signature bit flipped", async () => {
    const key = valueOf(await importPublicKey(RFC7520_RSA_PUBLIC_JWK, { alg: "RS256" }));

    expect(await verifierFor(key)(flipSignatureBit(RFC7520_RS256_TOKEN))).toEqual(failure({ code: "bad_signature" }));
  });

  it("should reproduce the 4.1 signature byte for byte with the Figure 4 private key", async () => {
    const key = valueOf(await importPrivateKey(RFC7520_RSA_PRIVATE_JWK, { alg: "RS256" }));

    expect(await signatureHexFor(key, RFC7520_RS256_TOKEN)).toBe(signatureHexOf(RFC7520_RS256_TOKEN));
  });

  it("should keep the Figure 3 kid on the imported public key", async () => {
    expect(await importPublicKey(RFC7520_RSA_PUBLIC_JWK, { alg: "RS256" })).toEqual({
      ok: true,
      value: { kind: "public", alg: "RS256", kid: "bilbo.baggins@hobbiton.example" },
    });
  });
});

// RFC 7520 Section 4.2 signs with PS384, which this package does not support; there is no PS256 vector.
// PSS is randomized, so PS256 is covered by the interop suite instead.
describe("RFC 7520 Section 4.2 (PS384)", () => {
  it("should reject the 4.2 PS384 token as an unsupported algorithm", async () => {
    const key = valueOf(await importPublicKey(RFC7520_RSA_PUBLIC_JWK, { alg: "PS256" }));

    expect(await verifierFor(key)(RFC7520_PS384_TOKEN)).toEqual(
      failure({ code: "unsupported_alg", path: ["header", "alg"] }),
    );
  });
});

// RFC 7520 Section 4.3 signs with ES512 over P-521, which this package does not support: not covered.

describe("RFC 7520 Section 4.4 (HS256)", () => {
  it("should verify the 4.4 signature, then reject its plain-text payload as malformed", async () => {
    const key = valueOf(await importSecretKey(RFC7520_HMAC_JWK, { alg: "HS256" }));

    expect(await verifierFor(key)(RFC7520_HS256_TOKEN)).toEqual(failure({ code: "malformed", path: ["payload"] }));
  });

  it("should report bad_signature, not malformed, for the 4.4 token with one signature bit flipped", async () => {
    const key = valueOf(await importSecretKey(RFC7520_HMAC_JWK, { alg: "HS256" }));

    expect(await verifierFor(key)(flipSignatureBit(RFC7520_HS256_TOKEN))).toEqual(failure({ code: "bad_signature" }));
  });

  it("should keep the Figure 5 kid on the imported secret key", async () => {
    expect(await importSecretKey(RFC7520_HMAC_JWK, { alg: "HS256" })).toEqual({
      ok: true,
      value: { kind: "secret", alg: "HS256", kid: "018c0ae5-4d9b-471b-bfd6-eef314bc7037", extractable: false },
    });
  });

  it("should refuse the Figure 5 oct key as an RS256 public key", async () => {
    const result = await importPublicKey(RFC7520_HMAC_JWK, { alg: "RS256" });

    expect(result).toEqual(failure({ code: "unsupported_key", path: ["kty"] }));
  });
});

// RFC 8037 also signs a plain-text payload ("Example of Ed25519 signing").
describe("RFC 8037 Appendix A.4 and A.5 (Ed25519)", () => {
  it("should verify the A.5 signature, then reject its plain-text payload as malformed", async () => {
    const key = await publicKeyOf(RFC8037_PRIVATE_JWK, "EdDSA");

    expect(await verifierFor(key)(RFC8037_TOKEN)).toEqual(failure({ code: "malformed", path: ["payload"] }));
  });

  it("should report bad_signature, not malformed, for the A.5 token with one signature bit flipped", async () => {
    const key = await publicKeyOf(RFC8037_PRIVATE_JWK, "EdDSA");

    expect(await verifierFor(key)(flipSignatureBit(RFC8037_TOKEN))).toEqual(failure({ code: "bad_signature" }));
  });

  it("should reject the EdDSA A.5 token for the A.2 key bound to Ed25519", async () => {
    const key = await publicKeyOf(RFC8037_PRIVATE_JWK, "Ed25519");

    expect(await verifierFor(key)(RFC8037_TOKEN)).toEqual(failure({ code: "no_matching_key" }));
  });

  it("should reproduce the A.4 signature byte for byte with the A.1 private key", async () => {
    const key = valueOf(await importPrivateKey(RFC8037_PRIVATE_JWK, { alg: "EdDSA" }));

    expect(await signatureHexFor(key, RFC8037_TOKEN)).toBe(RFC8037_SIGNATURE_HEX);
  });
});
