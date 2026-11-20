import { describe, expect, it } from "vitest";

import { exportPublicJwk, generateKeyPair, jwkThumbprint } from "../index";
import { KEY_MANAGEMENT_ALGORITHMS } from "./algorithms";
import { createDecrypter, createJweKeySet } from "./decrypt";
import { encrypt } from "./encrypt";
import {
  exportJwePrivateJwk,
  exportJwePublicJwk,
  exportJweSecretJwk,
  generateJweKeyPair,
  generateJweSecretKey,
  getJwePublicKey,
  importJweKeyPair,
  importJwePrivateKey,
  importJwePublicKey,
  importJweSecretKey,
} from "./keys";
import type { JweDecryptionKey, JweEncryptionKey } from "./types";

const failure = (code: string, path?: readonly string[], params?: object) => ({
  ok: false,
  error: { issues: [{ code, ...(path === undefined ? {} : { path }), ...(params === undefined ? {} : { params }) }] },
});

async function roundTrips(encryptionKey: JweEncryptionKey, decryptionKey: JweDecryptionKey): Promise<boolean> {
  const enc = encryptionKey.kind === "jwe-secret" && encryptionKey.alg === "dir" ? undefined : "A128GCM";
  const token = await encrypt({ plaintext: "round trip", key: encryptionKey, enc });
  const result = await createDecrypter({ keys: createJweKeySet([decryptionKey]) })(token);
  return result.ok && new TextDecoder().decode(result.value.plaintext) === "round trip";
}

describe("generateJweKeyPair", () => {
  it.each([
    ["RSA-OAEP", undefined],
    ["RSA-OAEP-256", undefined],
    ["ECDH-ES", "P-256"],
    ["ECDH-ES", "P-384"],
    ["ECDH-ES+A128KW", "P-521"],
    ["ECDH-ES+A256KW", "X25519"],
  ] as const)("should generate a frozen %s %s pair that round-trips", async (alg, crv) => {
    const pair = await generateJweKeyPair({ alg, crv, kid: "k1" });

    expect(Object.isFrozen(pair) && Object.isFrozen(pair.publicKey) && Object.isFrozen(pair.privateKey)).toBe(true);
    expect(pair.publicKey).toEqual({ kind: "jwe-public", alg, kid: "k1" });
    expect(pair.privateKey).toEqual({ kind: "jwe-private", alg, kid: "k1", extractable: false });
    expect(await roundTrips(pair.publicKey, pair.privateKey)).toBe(true);
  });

  it("should default to P-256, and name the key by its thumbprint when asked", async () => {
    const pair = await generateJweKeyPair({ alg: "ECDH-ES", kid: "thumbprint", extractable: true });

    expect((await exportJwePublicJwk(pair.publicKey)).crv).toBe("P-256");
    expect(pair.publicKey.kid).toBe(await jwkThumbprint(pair.publicKey));
  });

  it("should refuse a curve for RSA, a symmetric alg, and a modulus under 2048 bits", async () => {
    await expect(generateJweKeyPair({ alg: "RSA-OAEP", crv: "P-256" } as never)).rejects.toThrow(TypeError);
    await expect(generateJweKeyPair({ alg: "A128KW" } as never)).rejects.toThrow(TypeError);
    await expect(generateJweKeyPair({ alg: "RSA-OAEP", modulusLength: 1024 } as never)).rejects.toThrow(TypeError);
    await expect(generateJweKeyPair({ alg: "ECDH-ES", crv: "Ed25519" } as never)).rejects.toThrow(TypeError);
  });
});

describe("generateJweSecretKey", () => {
  it.each([
    ["A128KW", undefined, 16],
    ["A256KW", undefined, 32],
    ["dir", "A128GCM", 16],
    ["dir", "A256GCM", 32],
    ["dir", "A128CBC-HS256", 32],
    ["dir", "A256CBC-HS512", 64],
  ] as const)("should generate a %s %s secret of %i bytes", async (alg, enc, bytes) => {
    const key = await generateJweSecretKey({ alg, enc, extractable: true });
    const jwk = await exportJweSecretJwk(key);

    expect(Buffer.from(jwk.k as string, "base64url")).toHaveLength(bytes);
    expect(jwk).toMatchObject({ kty: "oct", alg, use: "enc" });
    expect(await roundTrips(key, key)).toBe(true);
  });

  it("should require enc for dir, and only for dir", async () => {
    await expect(generateJweSecretKey({ alg: "dir" })).rejects.toThrow(TypeError);
    await expect(generateJweSecretKey({ alg: "A128KW", enc: "A128GCM" })).rejects.toThrow(TypeError);
  });
});

describe("importJwePublicKey and importJwePrivateKey", () => {
  it("should import exported JWKs, and keep use enc and alg on export", async () => {
    const pair = await generateJweKeyPair({ alg: "RSA-OAEP-256", kid: "r", extractable: true });
    const publicJwk = await exportJwePublicJwk(pair.publicKey);
    const privateJwk = await exportJwePrivateJwk(pair.privateKey);

    expect(Object.isFrozen(publicJwk)).toBe(true);
    expect(publicJwk).toMatchObject({ kty: "RSA", alg: "RSA-OAEP-256", use: "enc", kid: "r" });
    expect(publicJwk).not.toHaveProperty("d");
    const imported = await importJweKeyPair(privateJwk, { alg: "RSA-OAEP-256" });
    expect(imported.ok && (await roundTrips(imported.value.publicKey, imported.value.privateKey))).toBe(true);
  });

  it("should refuse a signing JWK by use or key_ops, and a JWK naming another alg", async () => {
    const pair = await generateJweKeyPair({ alg: "ECDH-ES", extractable: true });
    const jwk = { ...(await exportJwePublicJwk(pair.publicKey)) };

    expect(await importJwePublicKey({ ...jwk, use: "sig" }, { alg: "ECDH-ES" })).toEqual(failure("wrong_use", ["use"]));
    expect(await importJwePublicKey({ ...jwk, use: undefined, key_ops: ["verify"] }, { alg: "ECDH-ES" })).toEqual(
      failure("wrong_use", ["key_ops"]),
    );
    expect(await importJwePublicKey({ ...jwk, key_ops: ["deriveBits", "deriveBits"] }, { alg: "ECDH-ES" })).toEqual(
      failure("invalid_key", ["key_ops"]),
    );
    expect(await importJwePublicKey(jwk, { alg: "ECDH-ES+A128KW" })).toEqual(failure("alg_mismatch", ["alg"]));
  });

  it("should accept a JWK without use or alg", async () => {
    const pair = await generateJweKeyPair({ alg: "ECDH-ES", extractable: true });
    const jwk = Object.fromEntries(
      Object.entries(await exportJwePrivateJwk(pair.privateKey)).filter(([name]) => name !== "use" && name !== "alg"),
    );

    expect((await importJwePrivateKey(jwk, { alg: "ECDH-ES+A256KW" })).ok).toBe(true);
  });

  it("should refuse a public JWK of a signing curve, and an RSA modulus under 2048 bits", async () => {
    const signing = await generateKeyPair({ alg: "Ed25519", extractable: true });
    const ed25519 = Object.fromEntries(
      Object.entries(await exportPublicJwk(signing.publicKey)).filter(([name]) => name !== "use" && name !== "alg"),
    );
    const small = await crypto.subtle.generateKey(
      { name: "RSA-OAEP", modulusLength: 1024, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-1" },
      true,
      ["encrypt", "decrypt"],
    );
    const smallJwk = await crypto.subtle.exportKey("jwk", small.publicKey);

    expect((await importJwePublicKey(ed25519, { alg: "ECDH-ES" })).ok).toBe(false);
    expect(await importJwePublicKey({ kty: "RSA", n: smallJwk.n, e: smallJwk.e }, { alg: "RSA-OAEP" })).toMatchObject({
      ok: false,
      error: { issues: [{ code: "weak_key" }] },
    });
  });

  it("should import a CryptoKeyPair only when its halves match", async () => {
    const generate = () =>
      crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as Promise<CryptoKeyPair>;
    const [one, two] = await Promise.all([generate(), generate()]);

    expect((await importJweKeyPair(one, { alg: "ECDH-ES" })).ok).toBe(true);
    expect(
      (await importJweKeyPair({ privateKey: one.privateKey, publicKey: two.publicKey }, { alg: "ECDH-ES" })).ok,
    ).toBe(false);
  });

  it("should import a public key from PEM", async () => {
    const pair = await crypto.subtle.generateKey(
      { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["encrypt", "decrypt"],
    );
    const der = Buffer.from(await crypto.subtle.exportKey("spki", pair.publicKey)).toString("base64");
    const pem = `-----BEGIN PUBLIC KEY-----\n${der.match(/.{1,64}/g)?.join("\n")}\n-----END PUBLIC KEY-----\n`;
    const imported = await importJwePublicKey(pem, { alg: "RSA-OAEP-256", kid: "pem" });

    expect(imported).toMatchObject({ ok: true, value: { kind: "jwe-public", alg: "RSA-OAEP-256", kid: "pem" } });
  });

  it("should import an RSA-OAEP CryptoKey only with the hash alg names", async () => {
    const pair = await crypto.subtle.generateKey(
      { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["encrypt", "decrypt"],
    );

    expect((await importJwePublicKey(pair.publicKey, { alg: "RSA-OAEP-256" })).ok).toBe(true);
    expect((await importJwePublicKey(pair.publicKey, { alg: "RSA-OAEP" })).ok).toBe(false);
  });

  it("should derive the public half of a private key", async () => {
    const pair = await generateJweKeyPair({ alg: "ECDH-ES", crv: "X25519", kid: "x" });
    const publicKey = getJwePublicKey(pair.privateKey);

    expect(publicKey).toEqual(pair.publicKey);
    expect(await roundTrips(publicKey, pair.privateKey)).toBe(true);
    expect(() => getJwePublicKey(pair.publicKey as never)).toThrow(TypeError);
  });

  it("should refuse to export a key that is not extractable", async () => {
    const pair = await generateJweKeyPair({ alg: "ECDH-ES" });

    await expect(exportJwePrivateJwk(pair.privateKey)).rejects.toThrow(TypeError);
    // A public key is always exportable.
    await expect(exportJwePublicJwk(pair.publicKey)).resolves.toMatchObject({ kty: "EC" });
  });
});

describe("importJweSecretKey", () => {
  it("should import raw bytes and JWKs of the exact length", async () => {
    expect((await importJweSecretKey(new Uint8Array(32), { alg: "A256KW" })).ok).toBe(true);
    expect(await importJweSecretKey(new Uint8Array(16), { alg: "A256KW" })).toMatchObject({
      ok: false,
      error: { issues: [{ code: "weak_key" }] },
    });
    expect(
      await importJweSecretKey({ kty: "oct", k: Buffer.alloc(33).toString("base64url") }, { alg: "A256KW" }),
    ).toEqual(failure("invalid_key", ["k"], { maximum: 32 }));
    expect(
      (
        await importJweSecretKey(
          { kty: "oct", k: Buffer.alloc(64).toString("base64url") },
          { alg: "dir", enc: "A256CBC-HS512" },
        )
      ).ok,
    ).toBe(true);
  });

  it("should import an AES-KW CryptoKey", async () => {
    const cryptoKey = await crypto.subtle.generateKey({ name: "AES-KW", length: 128 }, false, ["wrapKey", "unwrapKey"]);
    const imported = await importJweSecretKey(cryptoKey, { alg: "A128KW" });

    expect(imported.ok && (await roundTrips(imported.value, imported.value))).toBe(true);
    expect((await importJweSecretKey(cryptoKey, { alg: "A256KW" })).ok).toBe(false);
  });

  it("should never echo a secret in a failure", async () => {
    const bytes = crypto.getRandomValues(new Uint8Array(15));
    const result = await importJweSecretKey(bytes, { alg: "A128KW" });

    expect(JSON.stringify(result)).not.toContain(Buffer.from(bytes).toString("base64url"));
  });
});

describe("every key management algorithm", () => {
  it("should be covered by a generator", () => {
    expect([...KEY_MANAGEMENT_ALGORITHMS].sort()).toEqual(
      ["A128KW", "A256KW", "ECDH-ES", "ECDH-ES+A128KW", "ECDH-ES+A256KW", "RSA-OAEP", "RSA-OAEP-256", "dir"].sort(),
    );
  });
});
