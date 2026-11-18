import * as jose from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import {
  createKeySet,
  createVerifier,
  exportPrivateJwk,
  exportPublicJwk,
  exportSecretJwk,
  generateKeyPair,
  generateSecretKey,
  importKeySet,
  importPrivateKey,
  importPublicKey,
  importSecretKey,
  sign,
  type AsymmetricAlgorithm,
  type JwtResult,
  type KeySet,
} from "../../src";
import { RFC7515_A2_JWK, RFC8037_PRIVATE_JWK } from "./fixtures/rfc-vectors";

const ASYMMETRIC: readonly AsymmetricAlgorithm[] = [
  "ES256",
  "ES384",
  "ES512",
  "EdDSA",
  "Ed25519",
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
];
const SYMMETRIC = ["HS256", "HS384", "HS512"] as const;
/** A secret of each HMAC algorithm's minimum length: its hash output (RFC 7518 §3.2). */
const SECRET_BYTES = { HS256: 32, HS384: 48, HS512: 64 } as const;
const PAYLOAD = { iss: "https://issuer.example", sub: "user-1", aud: "app", iat: 1_800_000_000 };
const NOW = () => 1_800_000_000 * 1000;

const valueOf = <T>(result: JwtResult<T>): T => {
  if (!result.ok) {
    throw new Error(`expected ok, got ${JSON.stringify(result.error.issues)}`);
  }
  return result.value;
};

const verifierFor = (keys: KeySet) => createVerifier({ keys, now: NOW });

interface JosePair {
  readonly publicJwk: jose.JWK;
  readonly privateJwk: jose.JWK;
  readonly publicKey: CryptoKey;
  readonly privateKey: CryptoKey;
}

const josePairs = {} as Record<AsymmetricAlgorithm, JosePair>;
const joseSecrets = {} as Record<(typeof SYMMETRIC)[number], Uint8Array>;

beforeAll(async () => {
  await Promise.all(
    ASYMMETRIC.map(async (alg) => {
      const { publicKey, privateKey } = await jose.generateKeyPair(alg, { extractable: true });
      josePairs[alg] = {
        publicKey,
        privateKey,
        publicJwk: { ...(await jose.exportJWK(publicKey)), kid: `jose-${alg}` },
        privateJwk: { ...(await jose.exportJWK(privateKey)), kid: `jose-${alg}` },
      };
    }),
  );
  for (const alg of SYMMETRIC) {
    joseSecrets[alg] = crypto.getRandomValues(new Uint8Array(SECRET_BYTES[alg]));
  }
});

describe.each(ASYMMETRIC)("jose interop for %s", (alg) => {
  it("should produce a token jose verifies", async () => {
    const privateKey = valueOf(await importPrivateKey(josePairs[alg].privateJwk, { alg }));
    const token = await sign({ payload: PAYLOAD, key: privateKey });

    const verified = await jose.jwtVerify(token, josePairs[alg].publicKey, { algorithms: [alg] });

    expect([verified.protectedHeader, verified.payload]).toEqual([{ alg, kid: `jose-${alg}` }, PAYLOAD]);
  });

  it("should verify a token jose signed", async () => {
    const publicKey = valueOf(await importPublicKey(josePairs[alg].publicJwk, { alg }));
    const token = await new jose.SignJWT(PAYLOAD)
      .setProtectedHeader({ alg, kid: `jose-${alg}`, typ: "JWT" })
      .sign(josePairs[alg].privateKey);

    expect(await verifierFor(createKeySet([publicKey]))(token)).toEqual({
      ok: true,
      value: { header: { alg, kid: `jose-${alg}`, typ: "JWT" }, payload: PAYLOAD, key: publicKey },
    });
  });

  it("should export a public JWK jose imports and verifies with", async () => {
    const pair = await generateKeyPair({ alg, kid: "here" });
    const token = await sign({ payload: PAYLOAD, key: pair.privateKey });
    const joseKey = await jose.importJWK({ ...(await exportPublicJwk(pair.publicKey)) }, alg);

    const verified = await jose.jwtVerify(token, joseKey, { algorithms: [alg] });

    expect(verified.payload).toEqual(PAYLOAD);
  });

  it("should export a private JWK jose imports and signs with", async () => {
    const pair = await generateKeyPair({ alg, kid: "here", extractable: true });
    const joseKey = await jose.importJWK({ ...(await exportPrivateJwk(pair.privateKey)) }, alg);
    const token = await new jose.SignJWT(PAYLOAD).setProtectedHeader({ alg, kid: "here" }).sign(joseKey);

    expect(await verifierFor(createKeySet([pair.publicKey]))(token)).toEqual({
      ok: true,
      value: { header: { alg, kid: "here" }, payload: PAYLOAD, key: pair.publicKey },
    });
  });

  it("should load a JWKS of jose-exported JWKs and verify a jose token through it", async () => {
    const keySet = valueOf(await importKeySet({ keys: [josePairs[alg].publicJwk] }, { algorithms: [alg] }));
    const token = await new jose.SignJWT(PAYLOAD)
      .setProtectedHeader({ alg, kid: `jose-${alg}` })
      .sign(josePairs[alg].privateKey);

    const result = await verifierFor(keySet)(token);

    expect(valueOf(result).payload).toEqual(PAYLOAD);
  });

  it("should produce a JWKS jose's local key set verifies with", async () => {
    const pair = await generateKeyPair({ alg, kid: "here" });
    const token = await sign({ payload: PAYLOAD, key: pair.privateKey });
    const jwks = jose.createLocalJWKSet({ keys: [{ ...(await exportPublicJwk(pair.publicKey)) }] });

    const verified = await jose.jwtVerify(token, jwks, { algorithms: [alg] });

    expect(verified.payload).toEqual(PAYLOAD);
  });
});

describe.each(SYMMETRIC)("jose interop for %s", (alg) => {
  const joseSecret = (): Uint8Array => joseSecrets[alg];

  it("should produce a token jose verifies", async () => {
    const secretKey = valueOf(await importSecretKey(joseSecret(), { alg }));
    const token = await sign({ payload: PAYLOAD, key: secretKey });

    const verified = await jose.jwtVerify(token, joseSecret(), { algorithms: [alg] });

    expect([verified.protectedHeader, verified.payload]).toEqual([{ alg }, PAYLOAD]);
  });

  it("should verify a token jose signed", async () => {
    const secretKey = valueOf(await importSecretKey(joseSecret(), { alg }));
    const token = await new jose.SignJWT(PAYLOAD).setProtectedHeader({ alg }).sign(joseSecret());

    expect(await verifierFor(createKeySet([secretKey]))(token)).toEqual({
      ok: true,
      value: { header: { alg }, payload: PAYLOAD, key: secretKey },
    });
  });

  it("should export a secret JWK jose imports and signs with", async () => {
    const secretKey = await generateSecretKey({ alg, extractable: true });
    const joseKey = await jose.importJWK({ ...(await exportSecretJwk(secretKey)) }, alg);
    const token = await new jose.SignJWT(PAYLOAD).setProtectedHeader({ alg }).sign(joseKey);

    const result = await verifierFor(createKeySet([secretKey]))(token);

    expect(result.ok && result.value.payload).toEqual(PAYLOAD);
  });

  it("should import a secret JWK jose exported", async () => {
    const joseJwk = await jose.exportJWK(joseSecret());
    const secretKey = valueOf(await importSecretKey(joseJwk, { alg }));
    const token = await new jose.SignJWT(PAYLOAD).setProtectedHeader({ alg }).sign(joseSecret());

    const result = await verifierFor(createKeySet([secretKey]))(token);

    expect(result.ok && result.value.payload).toEqual(PAYLOAD);
  });
});

// RSASSA-PKCS1-v1_5 and Ed25519 signatures are deterministic, so both libraries must produce the same token.
describe("deterministic signatures match jose", () => {
  it.each([
    ["RS256", RFC7515_A2_JWK],
    ["RS384", RFC7515_A2_JWK],
    ["RS512", RFC7515_A2_JWK],
    ["EdDSA", RFC8037_PRIVATE_JWK],
    ["Ed25519", RFC8037_PRIVATE_JWK],
  ] as const)("should sign a %s token identical to jose's with the RFC key", async (alg, jwk) => {
    const privateKey = valueOf(await importPrivateKey(jwk, { alg }));
    const joseKey = await jose.importJWK(jwk, alg);

    const here = await sign({ payload: PAYLOAD, key: privateKey });
    const there = await new jose.SignJWT(PAYLOAD).setProtectedHeader({ alg }).sign(joseKey);

    expect(here).toBe(there);
  });
});
