import { describe, expect, it } from "vitest";

import type { AsymmetricAlgorithm } from "../core/types";
import { ALGORITHM_PARAMS } from "./algorithms";
import { exportPrivateJwk, exportPublicJwk, exportSecretJwk } from "./export";
import { generateKeyPair, generateSecretKey } from "./generate";
import { importPrivateKey, importPublicKey, importSecretKey } from "./import";
import { getKeyEntry } from "./registry";
import { EC_P256_PUBLIC_JWK, ED25519_PUBLIC_JWK, RSA_2048_PUBLIC_JWK, valueOf } from "./test-fixtures";

const ASYMMETRIC: readonly AsymmetricAlgorithm[] = ["ES256", "EdDSA", "Ed25519", "RS256", "PS256"];
const MESSAGE = new TextEncoder().encode("signing input");

const PUBLIC_MEMBERS: Record<AsymmetricAlgorithm, readonly string[]> = {
  ES256: ["kty", "alg", "use", "kid", "crv", "x", "y"],
  EdDSA: ["kty", "alg", "use", "kid", "crv", "x"],
  Ed25519: ["kty", "alg", "use", "kid", "crv", "x"],
  RS256: ["kty", "alg", "use", "kid", "n", "e"],
  PS256: ["kty", "alg", "use", "kid", "n", "e"],
};

const PRIVATE_MEMBERS: Record<AsymmetricAlgorithm, readonly string[]> = {
  ES256: [...PUBLIC_MEMBERS.ES256, "d"],
  EdDSA: [...PUBLIC_MEMBERS.EdDSA, "d"],
  Ed25519: [...PUBLIC_MEMBERS.Ed25519, "d"],
  RS256: [...PUBLIC_MEMBERS.RS256, "d", "p", "q", "dp", "dq", "qi"],
  PS256: [...PUBLIC_MEMBERS.PS256, "d", "p", "q", "dp", "dq", "qi"],
};

const SIGNATURE_LENGTH: Record<AsymmetricAlgorithm, number> = {
  ES256: 64,
  EdDSA: 64,
  Ed25519: 64,
  RS256: 256,
  PS256: 256,
};

describe.each(ASYMMETRIC)("generateKeyPair and export for %s", (alg) => {
  it("should return a frozen pair of frozen keys sharing alg and kid", async () => {
    const pair = await generateKeyPair({ alg, kid: "g1" });
    expect(pair).toEqual({
      privateKey: { kind: "private", alg, kid: "g1", extractable: false },
      publicKey: { kind: "public", alg, kid: "g1" },
    });
    expect([pair, pair.privateKey, pair.publicKey].every(Object.isFrozen)).toBe(true);
  });

  it("should produce keys whose signatures verify with the shared algorithm parameters", async () => {
    const { privateKey, publicKey } = await generateKeyPair({ alg });
    const { signParams } = ALGORITHM_PARAMS[alg];
    const signature = new Uint8Array(await crypto.subtle.sign(signParams, getKeyEntry(privateKey).cryptoKey, MESSAGE));
    expect(signature.length).toBe(getKeyEntry(publicKey).signatureLength);
    expect(await crypto.subtle.verify(signParams, getKeyEntry(publicKey).cryptoKey, signature, MESSAGE)).toBe(true);
  });

  it("should record the signature length of the algorithm", async () => {
    const { privateKey } = await generateKeyPair({ alg });
    expect(getKeyEntry(privateKey).signatureLength).toBe(SIGNATURE_LENGTH[alg]);
  });

  it("should export a frozen public JWK with members in a stable order", async () => {
    const { publicKey } = await generateKeyPair({ alg, kid: "g1" });
    const jwk = await exportPublicJwk(publicKey);
    expect(Object.keys(jwk)).toEqual(PUBLIC_MEMBERS[alg]);
    expect(jwk).toMatchObject({ alg, use: "sig", kid: "g1" });
    expect(Object.isFrozen(jwk)).toBe(true);
  });

  it("should export a frozen private JWK with members in a stable order when extractable", async () => {
    const { privateKey } = await generateKeyPair({ alg, kid: "g1", extractable: true });
    const jwk = await exportPrivateJwk(privateKey);
    expect(Object.keys(jwk)).toEqual(PRIVATE_MEMBERS[alg]);
    expect(Object.isFrozen(jwk)).toBe(true);
  });

  it("should round-trip exported JWKs through import", async () => {
    const pair = await generateKeyPair({ alg, kid: "g1", extractable: true });
    const [publicJwk, privateJwk] = await Promise.all([
      exportPublicJwk(pair.publicKey),
      exportPrivateJwk(pair.privateKey),
    ]);
    const [publicKey, privateKey] = await Promise.all([
      importPublicKey(publicJwk, { alg }),
      importPrivateKey(privateJwk, { alg, extractable: true }),
    ]);
    expect(await exportPublicJwk(valueOf(publicKey))).toEqual(publicJwk);
    expect(await exportPrivateJwk(valueOf(privateKey))).toEqual(privateJwk);
  });

  it("should throw TypeError when exporting a non-extractable private key", async () => {
    const { privateKey } = await generateKeyPair({ alg });
    await expect(exportPrivateJwk(privateKey)).rejects.toThrow(TypeError);
  });

  it("should throw TypeError when exporting a private key as public", async () => {
    const { privateKey } = await generateKeyPair({ alg, extractable: true });
    await expect(exportPublicJwk(privateKey as never)).rejects.toThrow(TypeError);
  });

  it("should show no material in JSON.stringify of either key", async () => {
    const pair = await generateKeyPair({ alg, extractable: true });
    expect(JSON.stringify(pair)).toBe(
      `{"privateKey":{"kind":"private","alg":"${alg}","extractable":true},"publicKey":{"kind":"public","alg":"${alg}"}}`,
    );
  });
});

describe.each([
  ["ES256", EC_P256_PUBLIC_JWK],
  ["EdDSA", ED25519_PUBLIC_JWK],
  ["RS256", RSA_2048_PUBLIC_JWK],
] as const)("exportPublicJwk of an imported %s key", (alg, publicJwk) => {
  it("should equal the imported members plus alg and use", async () => {
    const key = valueOf(await importPublicKey(publicJwk, { alg }));
    expect(await exportPublicJwk(key)).toEqual({ ...publicJwk, alg, use: "sig" });
  });
});

describe("generateKeyPair for RSA", () => {
  it("should use the modulusLength option and size signatures by it", async () => {
    const { publicKey } = await generateKeyPair({ alg: "RS256", modulusLength: 3072 });
    expect(getKeyEntry(publicKey).signatureLength).toBe(384);
  });
});

describe("generateKeyPair options", () => {
  it.each([
    null,
    { alg: "HS256" },
    { alg: "none" },
    { alg: "ES256", kid: 1 },
    { alg: "ES256", extractable: "true" },
    { alg: "ES256", modulusLength: 2048 },
    { alg: "RS256", modulusLength: 1024 },
  ])("should throw TypeError for options %o", async (options) => {
    await expect(generateKeyPair(options as never)).rejects.toThrow(TypeError);
  });
});

describe("generateSecretKey", () => {
  it("should return a frozen, non-extractable 32-byte secret key by default", async () => {
    const key = await generateSecretKey({ alg: "HS256", kid: "s1" });
    expect(key).toEqual({ kind: "secret", alg: "HS256", kid: "s1", extractable: false });
    expect(Object.isFrozen(key)).toBe(true);
    expect((getKeyEntry(key).cryptoKey.algorithm as HmacKeyAlgorithm).length).toBe(256);
  });

  it("should export a frozen oct JWK that imports back when extractable", async () => {
    const jwk = await exportSecretJwk(await generateSecretKey({ alg: "HS256", kid: "s1", extractable: true }));
    expect(Object.keys(jwk)).toEqual(["kty", "alg", "use", "kid", "k"]);
    expect(Object.isFrozen(jwk)).toBe(true);
    expect(valueOf(await importSecretKey(jwk, { alg: "HS256" }))).toEqual({
      kind: "secret",
      alg: "HS256",
      kid: "s1",
      extractable: false,
    });
  });

  it("should throw TypeError when exporting a non-extractable secret", async () => {
    await expect(exportSecretJwk(await generateSecretKey({ alg: "HS256" }))).rejects.toThrow(TypeError);
  });

  it("should produce a key that signs and verifies HMAC", async () => {
    const entry = getKeyEntry(await generateSecretKey({ alg: "HS256" }));
    const { signParams } = ALGORITHM_PARAMS.HS256;
    const signature = await crypto.subtle.sign(signParams, entry.cryptoKey, MESSAGE);
    expect(signature.byteLength).toBe(entry.signatureLength);
    expect(await crypto.subtle.verify(signParams, entry.cryptoKey, signature, MESSAGE)).toBe(true);
  });

  it.each([{ alg: "ES256" }, { alg: "HS256", kid: 1 }])("should throw TypeError for options %o", async (options) => {
    await expect(generateSecretKey(options as never)).rejects.toThrow(TypeError);
  });
});

describe("exporting a look-alike key", () => {
  it.each([
    [exportPublicJwk, { kind: "public", alg: "ES256" }],
    [exportPrivateJwk, { kind: "private", alg: "ES256", extractable: true }],
    [exportSecretJwk, { kind: "secret", alg: "HS256", extractable: true }],
  ] as const)("should throw TypeError (%#)", async (exporter, forged) => {
    await expect(exporter(Object.freeze(forged) as never)).rejects.toThrow(TypeError);
  });
});
