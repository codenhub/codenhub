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

const ASYMMETRIC: readonly AsymmetricAlgorithm[] = ["ES256", "EdDSA", "Ed25519", "RS256", "PS256"];
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
let joseSecret: Uint8Array;

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
  joseSecret = crypto.getRandomValues(new Uint8Array(32));
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

describe("jose interop for HS256", () => {
  it("should produce a token jose verifies", async () => {
    const secretKey = valueOf(await importSecretKey(joseSecret, { alg: "HS256" }));
    const token = await sign({ payload: PAYLOAD, key: secretKey });

    const verified = await jose.jwtVerify(token, joseSecret, { algorithms: ["HS256"] });

    expect([verified.protectedHeader, verified.payload]).toEqual([{ alg: "HS256" }, PAYLOAD]);
  });

  it("should verify a token jose signed", async () => {
    const secretKey = valueOf(await importSecretKey(joseSecret, { alg: "HS256" }));
    const token = await new jose.SignJWT(PAYLOAD).setProtectedHeader({ alg: "HS256" }).sign(joseSecret);

    expect(await verifierFor(createKeySet([secretKey]))(token)).toEqual({
      ok: true,
      value: { header: { alg: "HS256" }, payload: PAYLOAD, key: secretKey },
    });
  });

  it("should export a secret JWK jose imports and signs with", async () => {
    const secretKey = await generateSecretKey({ alg: "HS256", extractable: true });
    const joseKey = await jose.importJWK({ ...(await exportSecretJwk(secretKey)) }, "HS256");
    const token = await new jose.SignJWT(PAYLOAD).setProtectedHeader({ alg: "HS256" }).sign(joseKey);

    const result = await verifierFor(createKeySet([secretKey]))(token);

    expect(result.ok && result.value.payload).toEqual(PAYLOAD);
  });

  it("should import a secret JWK jose exported", async () => {
    const joseJwk = await jose.exportJWK(joseSecret);
    const secretKey = valueOf(await importSecretKey(joseJwk, { alg: "HS256" }));
    const token = await new jose.SignJWT(PAYLOAD).setProtectedHeader({ alg: "HS256" }).sign(joseSecret);

    const result = await verifierFor(createKeySet([secretKey]))(token);

    expect(result.ok && result.value.payload).toEqual(PAYLOAD);
  });
});

// RS256 and Ed25519 signatures are deterministic, so both libraries must produce the same token.
describe("deterministic signatures match jose", () => {
  it.each([
    ["RS256", RFC7515_A2_JWK],
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
