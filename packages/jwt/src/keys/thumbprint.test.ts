import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { decodeBase64Url } from "../encoding";
import { generateKeyPair, generateSecretKey } from "./generate";
import { importKeyPair, importPrivateKey, importPublicKey, importSecretKey } from "./import";
import {
  EC_P256_PRIVATE_JWK,
  EC_P256_PUBLIC_JWK,
  ED25519_PRIVATE_JWK,
  HMAC_SECRET_JWK,
  issuesOf,
  RSA_2048_PRIVATE_JWK,
  valueOf,
  withMembers,
} from "./test-fixtures";
import { jwkThumbprint } from "./thumbprint";

/** RFC 7638 §3.1: the RSA key of the example, and its thumbprint. */
const RFC7638_RSA_JWK = {
  kty: "RSA",
  n: "0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw",
  e: "AQAB",
  alg: "RS256",
  kid: "2011-04-29",
};
const RFC7638_THUMBPRINT = "NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs";

/** RFC 8037 Appendix A.3: the Ed25519 public key, and its thumbprint. */
const RFC8037_PUBLIC_JWK = { kty: "OKP", crv: "Ed25519", x: "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo" };
const RFC8037_THUMBPRINT = "kPrK_qmxVWaYVA9wwBF6Iuo3vVzz7TxHCTwXBygrS4k";

describe("jwkThumbprint", () => {
  it("should compute the RFC 7638 §3.1 thumbprint, whatever alg and kid the key carries", async () => {
    for (const alg of ["RS256", "PS512"] as const) {
      // oxlint-disable-next-line no-await-in-loop
      const key = valueOf(await importPublicKey({ ...RFC7638_RSA_JWK, alg }, { alg }));
      // oxlint-disable-next-line no-await-in-loop
      expect(await jwkThumbprint(key)).toBe(RFC7638_THUMBPRINT);
    }
  });

  it.each(["EdDSA", "Ed25519"] as const)("should compute the RFC 8037 A.3 thumbprint for %s", async (alg) => {
    const key = valueOf(await importPublicKey(RFC8037_PUBLIC_JWK, { alg }));
    expect(await jwkThumbprint(key)).toBe(RFC8037_THUMBPRINT);
  });

  it("should give an EC key a 43-character base64url thumbprint that ignores kid", async () => {
    const plain = await jwkThumbprint(valueOf(await importPublicKey(EC_P256_PUBLIC_JWK, { alg: "ES256" })));
    const named = await jwkThumbprint(
      valueOf(await importPublicKey({ ...EC_P256_PUBLIC_JWK, kid: "k1" }, { alg: "ES256" })),
    );
    expect(plain).toMatch(/^[\w-]{43}$/);
    expect(named).toBe(plain);
  });

  it("should give two generated keys different thumbprints", async () => {
    const [a, b] = await Promise.all([generateKeyPair({ alg: "ES384" }), generateKeyPair({ alg: "ES384" })]);
    expect(await jwkThumbprint(a.publicKey)).not.toBe(await jwkThumbprint(b.publicKey));
  });

  it.each(["ES256", "EdDSA", "RS256"] as const)(
    "should give a generated %s private key, not extractable, its public key's thumbprint",
    async (alg) => {
      const { privateKey, publicKey } = await generateKeyPair({ alg });
      expect([privateKey.extractable, await jwkThumbprint(privateKey)]).toEqual([
        false,
        await jwkThumbprint(publicKey),
      ]);
    },
  );

  it("should give a private key from importKeyPair its public key's thumbprint", async () => {
    const { privateKey, publicKey } = valueOf(await importKeyPair(EC_P256_PRIVATE_JWK, { alg: "ES256" }));
    expect(await jwkThumbprint(privateKey)).toBe(await jwkThumbprint(publicKey));
  });

  it.each([
    ["ES256", EC_P256_PRIVATE_JWK],
    ["Ed25519", ED25519_PRIVATE_JWK],
    ["RS256", RSA_2048_PRIVATE_JWK],
  ] as const)("should give a %s private key from importPrivateKey its public key's thumbprint", async (alg, jwk) => {
    const { publicKey } = valueOf(await importKeyPair(jwk, { alg }));
    expect(await jwkThumbprint(valueOf(await importPrivateKey(jwk, { alg })))).toBe(await jwkThumbprint(publicKey));
  });

  it("should give an extractable secret its oct thumbprint (RFC 7638 §3.2)", async () => {
    const secret = valueOf(await importSecretKey(HMAC_SECRET_JWK, { alg: "HS256", extractable: true }));
    expect(await jwkThumbprint(secret)).toBe(sha256Of(`{"k":"${HMAC_SECRET_JWK.k}","kty":"oct"}`));
  });

  it("should throw a TypeError for a secret that is not extractable", async () => {
    const secret = await generateSecretKey({ alg: "HS256" });
    await expect(jwkThumbprint(secret)).rejects.toThrow(
      new TypeError("jwkThumbprint: a secret key's thumbprint reads its material; create it with extractable: true."),
    );
  });

  it("should throw TypeError for a look-alike", async () => {
    const lookAlikes = [
      { kind: "public", alg: "ES256" },
      { kind: "private", alg: "ES256" },
      { kind: "secret", alg: "HS256", extractable: true },
    ];
    for (const key of lookAlikes) {
      // oxlint-disable-next-line no-await-in-loop
      await expect(jwkThumbprint(key as never)).rejects.toThrow(TypeError);
    }
  });
});

/** The RFC 7638 thumbprint of `members`, computed with node:crypto, apart from the package's own code. */
const sha256Of = (canonical: string): string => createHash("sha256").update(canonical).digest("base64url");

describe('kid: "thumbprint" on import', () => {
  it("should name a public key by the RFC 7638 §3.1 thumbprint", async () => {
    const jwk = withMembers(RFC7638_RSA_JWK, { kid: undefined });
    expect(valueOf(await importPublicKey(jwk, { alg: "RS256", kid: "thumbprint" })).kid).toBe(RFC7638_THUMBPRINT);
  });

  it("should accept a JWK whose own kid is its thumbprint, and refuse one with another kid at kid", async () => {
    const own = { ...RFC8037_PUBLIC_JWK, kid: RFC8037_THUMBPRINT };
    expect(valueOf(await importPublicKey(own, { alg: "EdDSA", kid: "thumbprint" })).kid).toBe(RFC8037_THUMBPRINT);
    const other = { ...RFC8037_PUBLIC_JWK, kid: "2026-11" };
    expect(issuesOf(await importPublicKey(other, { alg: "EdDSA", kid: "thumbprint" }))).toEqual([
      { code: "invalid_key", path: ["kid"] },
    ]);
    const literal = { ...RFC8037_PUBLIC_JWK, kid: "thumbprint" };
    expect(issuesOf(await importPublicKey(literal, { alg: "EdDSA", kid: "thumbprint" }))).toEqual([
      { code: "invalid_key", path: ["kid"] },
    ]);
    const conflicting = { ...EC_P256_PRIVATE_JWK, kid: "2026-11" };
    expect(issuesOf(await importKeyPair(conflicting, { alg: "ES256", kid: "thumbprint" }))).toEqual([
      { code: "invalid_key", path: ["kid"] },
    ]);
  });

  it.each([
    ["ES256", EC_P256_PRIVATE_JWK],
    ["Ed25519", ED25519_PRIVATE_JWK],
    ["RS256", RSA_2048_PRIVATE_JWK],
  ] as const)("should name both halves of a %s private JWK by the public key's thumbprint", async (alg, jwk) => {
    const pair = valueOf(await importKeyPair(jwk, { alg, kid: "thumbprint" }));
    const expected = await jwkThumbprint(pair.publicKey);
    expect([pair.privateKey.kid, pair.publicKey.kid]).toEqual([expected, expected]);
    expect(valueOf(await importPrivateKey(jwk, { alg, kid: "thumbprint" })).kid).toBe(expected);
  });

  it("should name a PEM key and a CryptoKeyPair by their thumbprint", async () => {
    const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const der = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
    const pem = `-----BEGIN PUBLIC KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PUBLIC KEY-----`;
    const fromPem = valueOf(await importPublicKey(pem, { alg: "ES256", kid: "thumbprint" }));
    const fromPair = valueOf(await importKeyPair(pair, { alg: "ES256", kid: "thumbprint" }));
    const fromCryptoKey = valueOf(await importPublicKey(pair.publicKey, { alg: "ES256", kid: "thumbprint" }));
    const expected = await jwkThumbprint(fromPem);
    expect([fromPem.kid, fromPair.privateKey.kid, fromPair.publicKey.kid, fromCryptoKey.kid]).toEqual([
      expected,
      expected,
      expected,
      expected,
    ]);
  });

  it("should name a secret by its oct thumbprint (RFC 7638 §3.2), from a JWK, bytes or a CryptoKey", async () => {
    const expected = sha256Of(`{"k":"${HMAC_SECRET_JWK.k}","kty":"oct"}`);
    const bytes = decodeBase64Url(HMAC_SECRET_JWK.k) as Uint8Array<ArrayBuffer>;
    const cryptoKey = await crypto.subtle.importKey("raw", bytes, { name: "HMAC", hash: "SHA-256" }, true, [
      "sign",
      "verify",
    ]);
    const kids = await Promise.all(
      [HMAC_SECRET_JWK, bytes, cryptoKey].map(async (input) => {
        return valueOf(await importSecretKey(input, { alg: "HS256", kid: "thumbprint" })).kid;
      }),
    );
    expect(kids).toEqual([expected, expected, expected]);
  });

  it("should refuse a non-extractable secret CryptoKey, whose thumbprint cannot be read, as invalid_key", async () => {
    const cryptoKey = await crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    expect(issuesOf(await importSecretKey(cryptoKey, { alg: "HS256", kid: "thumbprint" }))).toEqual([
      { code: "invalid_key" },
    ]);
  });
});
