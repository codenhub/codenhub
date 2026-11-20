import { describe, expect, it } from "vitest";

import type { AsymmetricAlgorithm } from "../core/types";
import { createKeySet } from "../keysets/local";
import { sign } from "../sign/sign";
import { createVerifier } from "../verify/create-verifier";
import { ALGORITHM_PARAMS } from "./algorithms";
import { exportPrivateJwk, exportPublicJwk, exportSecretJwk } from "./export";
import { importKeyPair, importPrivateKey, importPublicKey, importSecretKey } from "./import";
import { getPublicKey } from "./public-key";
import { valueOf } from "./test-fixtures";

const issuesOf = (result: { ok: boolean; error?: { issues: unknown } }) => (result.ok ? [] : result.error?.issues);

const exp = () => Math.floor(Date.now() / 1000) + 600;

/** A key pair made by Web Crypto directly, as an application holding its own keys would make it. */
async function webCryptoPair(alg: AsymmetricAlgorithm, extractable = false): Promise<CryptoKeyPair> {
  const { importParams, kty } = ALGORITHM_PARAMS[alg];
  const params =
    kty === "RSA"
      ? { ...(importParams as RsaHashedImportParams), modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }
      : importParams;
  return (await crypto.subtle.generateKey(params, extractable, ["sign", "verify"])) as CryptoKeyPair;
}

const hmacKey = (hash: string, length: number, extractable = false, usages: KeyUsage[] = ["sign", "verify"]) =>
  crypto.subtle.generateKey({ name: "HMAC", hash, length }, extractable, usages);

describe.each<AsymmetricAlgorithm>(["ES256", "ES512", "Ed25519", "RS256", "PS384"])(
  "CryptoKey import for %s",
  (alg) => {
    it("should import a non-extractable key pair that signs tokens its public key verifies", async () => {
      const pair = await webCryptoPair(alg);

      const imported = valueOf(await importKeyPair(pair, { alg, kid: "device-1" }));
      const token = await sign({ payload: { sub: "u1", exp: exp() }, key: imported.privateKey });

      expect(imported.privateKey).toEqual({ kind: "private", alg, kid: "device-1", extractable: false });
      expect(imported.publicKey).toEqual({ kind: "public", alg, kid: "device-1" });
      expect((await createVerifier({ keys: createKeySet([imported.publicKey]) })(token)).ok).toBe(true);
    });

    it("should import the public CryptoKey as the same key the pair carries", async () => {
      const pair = await webCryptoPair(alg);

      const publicKey = valueOf(await importPublicKey(pair.publicKey, { alg, kid: "k" }));
      const fromPair = valueOf(await importPrivateKey(pair, { alg }));

      expect(publicKey).toEqual({ kind: "public", alg, kid: "k" });
      expect(await exportPublicJwk(publicKey)).toEqual({
        ...(await exportPublicJwk(getPublicKey(fromPair))),
        kid: "k",
      });
    });
  },
);

describe("CryptoKey import", () => {
  it("should keep a non-extractable private key unexportable", async () => {
    const pair = await webCryptoPair("ES256");

    const privateKey = valueOf(await importPrivateKey(pair, { alg: "ES256" }));

    await expect(exportPrivateJwk(privateKey)).rejects.toThrow(TypeError);
  });

  it("should refuse extractable: true for a key pair whose private key is not extractable", async () => {
    const pair = await webCryptoPair("ES256");

    expect(issuesOf(await importKeyPair(pair, { alg: "ES256", extractable: true }))).toEqual([{ code: "invalid_key" }]);
  });

  it("should export an extractable key pair only when imported with extractable: true", async () => {
    const pair = await webCryptoPair("ES256", true);

    const exportable = valueOf(await importPrivateKey(pair, { alg: "ES256", extractable: true }));
    const sealed = valueOf(await importPrivateKey(pair, { alg: "ES256" }));

    expect((await exportPrivateJwk(exportable)).d).toEqual(expect.any(String));
    await expect(exportPrivateJwk(sealed)).rejects.toThrow(TypeError);
  });

  it("should import an extractable private CryptoKey given alone", async () => {
    const pair = await webCryptoPair("ES256", true);

    const imported = valueOf(await importKeyPair(pair.privateKey, { alg: "ES256" }));

    expect(await exportPublicJwk(imported.publicKey)).toEqual(
      await exportPublicJwk(valueOf(await importPublicKey(pair.publicKey, { alg: "ES256" }))),
    );
  });

  it("should refuse a non-extractable private CryptoKey given alone, whose public half cannot be read", async () => {
    const pair = await webCryptoPair("ES256");

    expect(issuesOf(await importPrivateKey(pair.privateKey, { alg: "ES256" }))).toEqual([{ code: "invalid_key" }]);
  });

  it("should refuse a pair whose halves belong to different keys", async () => {
    const [a, b] = await Promise.all([webCryptoPair("ES256"), webCryptoPair("ES256")]);

    expect(
      issuesOf(await importKeyPair({ privateKey: a.privateKey, publicKey: b.publicKey }, { alg: "ES256" })),
    ).toEqual([{ code: "invalid_key" }]);
  });

  it.each<[string, AsymmetricAlgorithm, AsymmetricAlgorithm]>([
    ["another curve", "ES384", "ES256"],
    ["another hash", "RS512", "RS256"],
    ["another RSA scheme", "PS256", "RS256"],
    ["another key type", "Ed25519", "ES256"],
  ])("should refuse a key pair of %s than alg", async (_, made, alg) => {
    const pair = await webCryptoPair(made);

    const result = await importKeyPair(pair, { alg });

    expect(result.ok).toBe(false);
  });

  it("should refuse a private CryptoKey where a public one is expected as unexpected_private_key", async () => {
    const pair = await webCryptoPair("ES256", true);

    expect(issuesOf(await importPublicKey(pair.privateKey, { alg: "ES256" }))).toEqual([
      { code: "unexpected_private_key" },
    ]);
  });

  it("should refuse a secret CryptoKey where a public or private one is expected", async () => {
    const secret = await hmacKey("SHA-256", 256, true);

    expect(issuesOf(await importPublicKey(secret, { alg: "ES256" }))).toEqual([{ code: "invalid_key" }]);
    expect(issuesOf(await importKeyPair(secret, { alg: "ES256" }))).toEqual([{ code: "invalid_key" }]);
  });

  it("should refuse a pair whose privateKey is a public key", async () => {
    const pair = await webCryptoPair("ES256");

    expect(
      issuesOf(await importKeyPair({ privateKey: pair.publicKey, publicKey: pair.publicKey }, { alg: "ES256" })),
    ).toEqual([{ code: "invalid_key" }]);
  });
});

describe("CryptoKey made for another purpose", () => {
  const rsaOaep = () =>
    crypto.subtle.generateKey(
      { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["encrypt", "decrypt"],
    ) as Promise<CryptoKeyPair>;
  const ecdh = () =>
    crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as Promise<CryptoKeyPair>;

  it("should refuse an RSA-OAEP key alone as alg_mismatch, public or private", async () => {
    const pair = await rsaOaep();

    expect(issuesOf(await importPublicKey(pair.publicKey, { alg: "RS256" }))).toEqual([{ code: "alg_mismatch" }]);
    expect(issuesOf(await importPrivateKey(pair.privateKey, { alg: "RS256" }))).toEqual([{ code: "alg_mismatch" }]);
  });

  it("should refuse an ECDH key alone as alg_mismatch, public or private", async () => {
    const pair = await ecdh();

    expect(issuesOf(await importPublicKey(pair.publicKey, { alg: "ES256" }))).toEqual([{ code: "alg_mismatch" }]);
    expect(issuesOf(await importKeyPair(pair.privateKey, { alg: "ES256" }))).toEqual([{ code: "alg_mismatch" }]);
  });

  it("should refuse an ECDH key pair as alg_mismatch", async () => {
    expect(issuesOf(await importKeyPair(await ecdh(), { alg: "ES256" }))).toEqual([{ code: "alg_mismatch" }]);
  });

  it.each<[string, AsymmetricAlgorithm, AsymmetricAlgorithm]>([
    ["another hash", "RS512", "RS256"],
    ["another RSA scheme", "PS256", "RS256"],
    ["another key type", "Ed25519", "ES256"],
  ])("should refuse a public CryptoKey of %s as alg_mismatch", async (_, made, alg) => {
    const pair = await webCryptoPair(made, true);

    expect(issuesOf(await importPublicKey(pair.publicKey, { alg }))).toEqual([{ code: "alg_mismatch" }]);
  });

  it("should refuse a public CryptoKey without the verify usage as wrong_use", async () => {
    const publicKey = (
      (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"])) as CryptoKeyPair
    ).publicKey;

    expect(issuesOf(await importPublicKey(publicKey, { alg: "ES256" }))).toEqual([{ code: "wrong_use" }]);
  });
});

describe("CryptoKey impostors", () => {
  it("should report invalid_key without throwing for an object that only inherits from CryptoKey", async () => {
    const impostor = Object.create(CryptoKey.prototype) as CryptoKey;
    const pair = await webCryptoPair("ES256");
    const codesOf = (result: { ok: boolean; error?: { issues: readonly { code: string }[] } }) =>
      result.ok ? [] : result.error?.issues.map((issue) => issue.code);

    // Not a key, so it is read as the JWK it is not, and refused as one.
    expect(codesOf(await importPublicKey(impostor, { alg: "ES256" }))).toEqual(["invalid_key"]);
    expect(codesOf(await importPrivateKey(impostor, { alg: "ES256" }))).toEqual(["invalid_key"]);
    expect(codesOf(await importKeyPair({ privateKey: impostor, publicKey: pair.publicKey }, { alg: "ES256" }))).toEqual(
      ["invalid_key"],
    );
    expect(codesOf(await importSecretKey(impostor, { alg: "HS256" }))).toEqual(["invalid_key"]);
  });

  it("should report invalid_key without throwing for a proxy of a real CryptoKey", async () => {
    const proxy = new Proxy((await webCryptoPair("ES256")).publicKey, {});

    expect(issuesOf(await importPublicKey(proxy, { alg: "ES256" }))).toEqual([{ code: "invalid_key" }]);
  });
});

describe("importSecretKey with a CryptoKey", () => {
  it("should keep a non-extractable HMAC key that signs and verifies", async () => {
    const secret = valueOf(await importSecretKey(await hmacKey("SHA-256", 256), { alg: "HS256", kid: "s1" }));
    const token = await sign({ payload: { sub: "u1", exp: exp() }, key: secret });

    expect(secret).toEqual({ kind: "secret", alg: "HS256", kid: "s1", extractable: false });
    expect((await createVerifier({ keys: createKeySet([secret]) })(token)).ok).toBe(true);
    await expect(exportSecretJwk(secret)).rejects.toThrow(TypeError);
  });

  it("should export an extractable HMAC key imported with extractable: true", async () => {
    const secret = valueOf(
      await importSecretKey(await hmacKey("SHA-384", 384, true), { alg: "HS384", extractable: true }),
    );

    expect((await exportSecretJwk(secret)).k).toEqual(expect.any(String));
  });

  it("should report weak_key for a key shorter than the hash output", async () => {
    expect(issuesOf(await importSecretKey(await hmacKey("SHA-256", 248), { alg: "HS256" }))).toEqual([
      { code: "weak_key", params: { minimum: 32 } },
    ]);
  });

  it.each<[string, () => Promise<CryptoKey>, boolean]>([
    ["another hash", () => hmacKey("SHA-512", 512), false],
    ["only the sign usage", () => hmacKey("SHA-256", 256, false, ["sign"]), false],
    ["a non-extractable key with extractable: true", () => hmacKey("SHA-256", 256), true],
    ["an asymmetric key", async () => (await webCryptoPair("ES256")).privateKey, false],
  ])("should refuse %s as invalid_key", async (_, make, extractable) => {
    expect(issuesOf(await importSecretKey(await make(), { alg: "HS256", extractable }))).toEqual([
      { code: "invalid_key" },
    ]);
  });
});
