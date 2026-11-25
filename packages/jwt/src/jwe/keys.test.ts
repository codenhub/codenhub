import { describe, expect, it, vi } from "vitest";

import { exportPublicJwk, generateKeyPair, jwkThumbprint } from "../index";
import { KEY_MANAGEMENT_ALGORITHMS } from "./algorithms";
import { createDecrypter, createJweKeySet } from "./decrypt";
import { encrypt } from "./encrypt";
import {
  exportJwePrivateJwk,
  exportJwePrivatePem,
  exportJwePublicJwk,
  exportJwePublicPem,
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

  it.each([
    ["P-256", { name: "ECDH", namedCurve: "P-256" }],
    ["X25519", { name: "X25519" }],
  ] as const)(
    "should import a %s public JWK as Web Crypto exports it, with an empty key_ops",
    async (_curve, params) => {
      const pair = (await crypto.subtle.generateKey(params, true, ["deriveBits"])) as CryptoKeyPair;
      const exported = await crypto.subtle.exportKey("jwk", pair.publicKey);

      expect(exported.key_ops).toEqual([]);
      expect((await importJwePublicKey(exported, { alg: "ECDH-ES" })).ok).toBe(true);
      expect((await importJwePublicKey({ ...exported, use: "enc" }, { alg: "ECDH-ES+A128KW" })).ok).toBe(true);
      expect(await importJwePublicKey({ ...exported, key_ops: ["verify"] }, { alg: "ECDH-ES" })).toEqual(
        failure("wrong_use", ["key_ops"]),
      );
    },
  );

  it.each([
    ["the zero point", new Uint8Array(32)],
    ["the point of order 1, u = 1", Uint8Array.from({ length: 32 }, (_, index) => (index === 0 ? 1 : 0))],
    ["a point of order 8", Buffer.from("e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800", "hex")],
  ])("should refuse a low-order X25519 public key, %s, as invalid_key in every form", async (_name, point) => {
    const x = Buffer.from(point).toString("base64url");
    const jwk = { kty: "OKP", crv: "X25519", x };
    // SPKI of an X25519 key: the algorithm identifier, then the 32-byte point.
    const spki = Buffer.concat([Buffer.from("302a300506032b656e032100", "hex"), point]);
    const pem = `-----BEGIN PUBLIC KEY-----\n${spki.toString("base64")}\n-----END PUBLIC KEY-----\n`;

    expect(await importJwePublicKey(jwk, { alg: "ECDH-ES" })).toEqual(failure("invalid_key"));
    expect(await importJwePublicKey(jwk, { alg: "ECDH-ES+A256KW" })).toEqual(failure("invalid_key"));
    expect(await importJwePublicKey(pem, { alg: "ECDH-ES" })).toEqual(failure("invalid_key"));
  });

  it.each(["P-256", "P-384", "P-521"] as const)(
    "should refuse a %s public key off the curve as invalid_key before Web Crypto sees it",
    async (crv) => {
      const pair = await generateJweKeyPair({ alg: "ECDH-ES", crv });
      const { x, y } = await exportJwePublicJwk(pair.publicKey);
      const flipped = Buffer.from(y as string, "base64url");
      flipped[flipped.length - 1] = (flipped[flipped.length - 1] as number) ^ 1;
      const importKey = vi.spyOn(crypto.subtle, "importKey");
      try {
        expect(
          await importJwePublicKey({ kty: "EC", crv, x, y: flipped.toString("base64url") }, { alg: "ECDH-ES" }),
        ).toEqual(failure("invalid_key"));
        expect(await importJwePublicKey({ kty: "EC", crv, x, y: x }, { alg: "ECDH-ES" })).toEqual(
          failure("invalid_key"),
        );
        expect(importKey).not.toHaveBeenCalled();
        expect((await importJwePublicKey({ kty: "EC", crv, x, y }, { alg: "ECDH-ES" })).ok).toBe(true);
      } finally {
        importKey.mockRestore();
      }
    },
  );

  it("should refuse a private JWK whose public point is off the curve as invalid_key", async () => {
    const pair = await generateJweKeyPair({ alg: "ECDH-ES", crv: "P-256", extractable: true });
    const jwk = await exportJwePrivateJwk(pair.privateKey);

    expect(await importJwePrivateKey({ ...jwk, y: jwk.x }, { alg: "ECDH-ES" })).toEqual(failure("invalid_key"));
  });

  it("should refuse a CryptoKeyPair whose public half is a low-order X25519 point", async () => {
    const [pair, lowOrder] = await Promise.all([
      crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"]) as Promise<CryptoKeyPair>,
      crypto.subtle.importKey("raw", new Uint8Array(32), { name: "X25519" }, true, []),
    ]);

    expect(await importJweKeyPair({ privateKey: pair.privateKey, publicKey: lowOrder }, { alg: "ECDH-ES" })).toEqual(
      failure("invalid_key"),
    );
  });

  it("should still refuse an empty key_ops on an RSA key, a private key and a secret", async () => {
    const rsa = await generateJweKeyPair({ alg: "RSA-OAEP-256", extractable: true });
    const ec = await generateJweKeyPair({ alg: "ECDH-ES", extractable: true });
    const secret = await generateJweSecretKey({ alg: "A128KW", extractable: true });

    expect(
      await importJwePublicKey({ ...(await exportJwePublicJwk(rsa.publicKey)), key_ops: [] }, { alg: "RSA-OAEP-256" }),
    ).toEqual(failure("wrong_use", ["key_ops"]));
    expect(
      await importJwePrivateKey({ ...(await exportJwePrivateJwk(ec.privateKey)), key_ops: [] }, { alg: "ECDH-ES" }),
    ).toEqual(failure("wrong_use", ["key_ops"]));
    expect(await importJweSecretKey({ ...(await exportJweSecretJwk(secret)), key_ops: [] }, { alg: "A128KW" })).toEqual(
      failure("wrong_use", ["key_ops"]),
    );
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

  it.each([
    ["an Ed25519 key for ECDH-ES", { name: "Ed25519" }, "ECDH-ES", ["crv"]],
    ["a P-256 key for RSA-OAEP", { name: "ECDSA", namedCurve: "P-256" }, "RSA-OAEP", ["kty"]],
    ["an X25519 key for RSA-OAEP-256", { name: "X25519" }, "RSA-OAEP-256", ["kty"]],
  ] as const)("should report unsupported_key for a PEM holding %s", async (_name, params, alg, path) => {
    const pair = (await crypto.subtle.generateKey(
      params,
      true,
      params.name === "X25519" ? ["deriveBits"] : ["sign", "verify"],
    )) as CryptoKeyPair;
    const der = Buffer.from(await crypto.subtle.exportKey("spki", pair.publicKey)).toString("base64");
    const pem = `-----BEGIN PUBLIC KEY-----
${der}
-----END PUBLIC KEY-----
`;

    expect(await importJwePublicKey(pem, { alg })).toEqual({
      ok: false,
      error: { issues: [{ code: "unsupported_key", path }] },
    });
  });

  it("should read an X25519 PEM key for ECDH-ES", async () => {
    const pair = (await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"])) as CryptoKeyPair;
    const der = Buffer.from(await crypto.subtle.exportKey("spki", pair.publicKey)).toString("base64");
    const pem = `-----BEGIN PUBLIC KEY-----
${der}
-----END PUBLIC KEY-----
`;

    expect((await importJwePublicKey(pem, { alg: "ECDH-ES" })).ok).toBe(true);
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

describe("AES-GCM key wrap and the RSA-OAEP SHA-2 variants", () => {
  it.each(["A128GCMKW", "A256GCMKW"] as const)("should generate, export and import a %s secret", async (alg) => {
    const key = await generateJweSecretKey({ alg, kid: "gcm", extractable: true });
    const jwk = await exportJweSecretJwk(key);
    const imported = await importJweSecretKey(jwk, { alg });

    expect(jwk).toMatchObject({ kty: "oct", alg, use: "enc", kid: "gcm" });
    expect(Buffer.from(jwk.k as string, "base64url")).toHaveLength(alg === "A128GCMKW" ? 16 : 32);
    expect(imported.ok && (await roundTrips(key, imported.value))).toBe(true);
    expect(await importJweSecretKey(jwk, { alg: alg === "A128GCMKW" ? "A256GCMKW" : "A128GCMKW" })).toEqual(
      failure("alg_mismatch", ["alg"]),
    );
  });

  it("should import secrets of exactly the GCM key wrap's length, and an AES-GCM CryptoKey", async () => {
    const cryptoKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    const imported = await importJweSecretKey(cryptoKey, { alg: "A256GCMKW" });

    expect(imported.ok && (await roundTrips(imported.value, imported.value))).toBe(true);
    expect((await importJweSecretKey(cryptoKey, { alg: "A128GCMKW" })).ok).toBe(false);
    expect(await importJweSecretKey(new Uint8Array(15), { alg: "A128GCMKW" })).toMatchObject({
      ok: false,
      error: { issues: [{ code: "weak_key", params: { minimum: 16 } }] },
    });
    expect(
      await importJweSecretKey({ kty: "oct", k: Buffer.alloc(17).toString("base64url") }, { alg: "A128GCMKW" }),
    ).toEqual(failure("invalid_key", ["k"], { maximum: 16 }));
    const aesKw = await crypto.subtle.generateKey({ name: "AES-KW", length: 128 }, false, ["wrapKey", "unwrapKey"]);
    expect((await importJweSecretKey(aesKw, { alg: "A128GCMKW" })).ok).toBe(false);
  });

  it.each(["RSA-OAEP-384", "RSA-OAEP-512"] as const)(
    "should generate, export, import and thumbprint a %s pair",
    async (alg) => {
      const pair = await generateJweKeyPair({ alg, kid: "thumbprint", extractable: true });
      const imported = await importJweKeyPair(await exportJwePrivateJwk(pair.privateKey), { alg });

      expect(await exportJwePublicJwk(pair.publicKey)).toMatchObject({ kty: "RSA", alg, use: "enc" });
      expect(pair.publicKey.kid).toBe(await jwkThumbprint(pair.publicKey));
      expect(imported.ok && (await roundTrips(imported.value.publicKey, pair.privateKey))).toBe(true);
      expect(await importJwePublicKey(await exportJwePublicJwk(pair.publicKey), { alg: "RSA-OAEP-256" })).toEqual(
        failure("alg_mismatch", ["alg"]),
      );
    },
  );

  it("should import an RSA-OAEP CryptoKey for RSA-OAEP-512 only with SHA-512", async () => {
    const pair = await crypto.subtle.generateKey(
      { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-512" },
      true,
      ["encrypt", "decrypt"],
    );

    expect((await importJwePublicKey(pair.publicKey, { alg: "RSA-OAEP-512" })).ok).toBe(true);
    expect((await importJwePublicKey(pair.publicKey, { alg: "RSA-OAEP-384" })).ok).toBe(false);
    expect((await importJweKeyPair(pair, { alg: "RSA-OAEP-512" })).ok).toBe(true);
  });
});

describe("exportJwePublicPem and exportJwePrivatePem", () => {
  it.each([
    ["RSA-OAEP-256", undefined],
    ["ECDH-ES", "P-256"],
    ["ECDH-ES+A256KW", "P-521"],
    ["ECDH-ES+A128KW", "X25519"],
  ] as const)("should round-trip a %s %s pair through SPKI and PKCS#8 PEM", async (alg, crv) => {
    const pair = await generateJweKeyPair({ alg, ...(crv === undefined ? {} : { crv }), extractable: true });

    const publicPem = await exportJwePublicPem(pair.publicKey);
    const privatePem = await exportJwePrivatePem(pair.privateKey);

    expect(publicPem).toMatch(/^-----BEGIN PUBLIC KEY-----\n([A-Za-z0-9+/=]{1,64}\n)+-----END PUBLIC KEY-----\n$/);
    expect(privatePem).toMatch(/^-----BEGIN PRIVATE KEY-----\n([A-Za-z0-9+/=]{1,64}\n)+-----END PRIVATE KEY-----\n$/);
    const publicKey = await importJwePublicKey(publicPem, { alg });
    const privateKey = await importJwePrivateKey(privatePem, { alg });
    if (!publicKey.ok || !privateKey.ok) {
      throw new Error("a PEM export did not import again");
    }
    expect(await roundTrips(publicKey.value, privateKey.value)).toBe(true);
    expect(await roundTrips(pair.publicKey, privateKey.value)).toBe(true);
  });

  it("should export the public half of a non-extractable pair, and refuse its private half", async () => {
    const pair = await generateJweKeyPair({ alg: "ECDH-ES" });

    await expect(exportJwePublicPem(pair.publicKey)).resolves.toContain("BEGIN PUBLIC KEY");
    await expect(exportJwePrivatePem(pair.privateKey)).rejects.toThrow(
      new TypeError("exportJwePrivatePem: the key was not created with extractable: true."),
    );
  });

  it("should refuse a key of the wrong kind, a secret, a JWS key and a look-alike with TypeError", async () => {
    const pair = await generateJweKeyPair({ alg: "ECDH-ES", extractable: true });
    const secret = await generateJweSecretKey({ alg: "A128KW", extractable: true });
    const signing = await generateKeyPair({ alg: "ES256", extractable: true });

    await expect(exportJwePublicPem(pair.privateKey as never)).rejects.toThrow(/getJwePublicKey/);
    await expect(exportJwePrivatePem(pair.publicKey as never)).rejects.toThrow(TypeError);
    await expect(exportJwePublicPem(secret as never)).rejects.toThrow(TypeError);
    await expect(exportJwePrivatePem(secret as never)).rejects.toThrow(TypeError);
    await expect(exportJwePublicPem(signing.publicKey as never)).rejects.toThrow(TypeError);
    await expect(exportJwePrivatePem({ ...pair.privateKey } as never)).rejects.toThrow(TypeError);
  });
});

describe("every key management algorithm", () => {
  it("should be covered by a generator", () => {
    expect([...KEY_MANAGEMENT_ALGORITHMS].sort()).toEqual(
      [
        "A128KW",
        "A256KW",
        "A128GCMKW",
        "A256GCMKW",
        "ECDH-ES",
        "ECDH-ES+A128KW",
        "ECDH-ES+A256KW",
        "RSA-OAEP",
        "RSA-OAEP-256",
        "RSA-OAEP-384",
        "RSA-OAEP-512",
        "dir",
      ].sort(),
    );
  });
});
