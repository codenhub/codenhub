import { createPrivateKey, createPublicKey } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { AsymmetricAlgorithm } from "../core/types";
import { exportPrivateJwk, exportPrivatePem, exportPublicJwk, exportPublicPem } from "./export";
import { createExternalSigningKey } from "./external";
import { generateKeyPair, generateSecretKey } from "./generate";
import { importKeyPair, importPrivateKey, importPublicKey } from "./import";
import { EC_P256_PRIVATE_JWK, valueOf } from "./test-fixtures";

const PEM_LINES =
  /^-----BEGIN (PUBLIC|PRIVATE) KEY-----\n(?:[A-Za-z0-9+/]{64}\n)*[A-Za-z0-9+/=]{4,64}\n-----END \1 KEY-----\n$/;

describe.each<AsymmetricAlgorithm>(["ES256", "ES384", "ES512", "EdDSA", "Ed25519", "RS256", "PS384"])(
  "PEM export for %s",
  (alg) => {
    it("should export SPKI and PKCS#8 in 64-character lines that import back as the same key", async () => {
      const pair = await generateKeyPair({ alg, kid: "pem", extractable: true });
      const publicPem = await exportPublicPem(pair.publicKey);
      const privatePem = await exportPrivatePem(pair.privateKey);
      expect(publicPem).toMatch(PEM_LINES);
      expect(privatePem).toMatch(PEM_LINES);
      expect(publicPem.startsWith("-----BEGIN PUBLIC KEY-----\n")).toBe(true);
      expect(privatePem.startsWith("-----BEGIN PRIVATE KEY-----\n")).toBe(true);

      const publicKey = valueOf(await importPublicKey(publicPem, { alg }));
      const privateKey = valueOf(await importPrivateKey(privatePem, { alg, extractable: true }));
      expect(await exportPublicJwk(publicKey)).toEqual({ ...(await exportPublicJwk(pair.publicKey)), kid: undefined });
      expect(await exportPrivateJwk(privateKey)).toEqual({
        ...(await exportPrivateJwk(pair.privateKey)),
        kid: undefined,
      });
    });

    it("should export PEM that OpenSSL reads as the same key", async () => {
      const pair = await generateKeyPair({ alg, extractable: true });
      const jwk = { ...(await exportPublicJwk(pair.publicKey)), alg: undefined, use: undefined };
      const fromPublic = createPublicKey(await exportPublicPem(pair.publicKey)).export({ format: "jwk" });
      const fromPrivate = createPublicKey(createPrivateKey(await exportPrivatePem(pair.privateKey))).export({
        format: "jwk",
      });
      expect(fromPublic).toEqual(jwk);
      expect(fromPrivate).toEqual(jwk);
    });
  },
);

describe("PEM export refusals", () => {
  it("should throw a TypeError for a private key that is not extractable", async () => {
    const { privateKey } = await generateKeyPair({ alg: "ES256" });
    await expect(exportPrivatePem(privateKey)).rejects.toThrow(
      new TypeError("exportPrivatePem: the key was not created with extractable: true."),
    );
  });

  it("should throw a TypeError for a key held by an external signer", async () => {
    const { publicKey } = valueOf(await importKeyPair(EC_P256_PRIVATE_JWK, { alg: "ES256" }));
    const key = createExternalSigningKey({ publicKey, sign: async () => new Uint8Array(64) });
    await expect(exportPrivatePem(key)).rejects.toThrow(
      new TypeError("exportPrivatePem: the key's material is held by an external signer."),
    );
  });

  it("should point a private key given to exportPublicPem to getPublicKey", async () => {
    const { privateKey } = await generateKeyPair({ alg: "ES256" });
    await expect(exportPublicPem(privateKey as never)).rejects.toThrow(
      new TypeError("exportPublicPem: key is a private key; export its public half with getPublicKey(key)."),
    );
  });

  it("should throw a TypeError for a secret key, a public key given as private, and a look-alike", async () => {
    const secret = await generateSecretKey({ alg: "HS256", extractable: true });
    const { publicKey } = await generateKeyPair({ alg: "ES256" });
    await expect(exportPublicPem(secret as never)).rejects.toThrow(TypeError);
    await expect(exportPrivatePem(secret as never)).rejects.toThrow(TypeError);
    await expect(exportPrivatePem(publicKey as never)).rejects.toThrow(TypeError);
    await expect(exportPublicPem({ kind: "public", alg: "ES256" } as never)).rejects.toThrow(TypeError);
  });
});
