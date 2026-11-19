import { describe, expect, it } from "vitest";

import type { PrivateKey } from "../core/types";
import { createKeySet } from "../keysets/local";
import { sign } from "../sign/sign";
import { createVerifier } from "../verify/create-verifier";
import { exportPrivateJwk, exportPublicJwk } from "./export";
import { generateKeyPair, generateSecretKey } from "./generate";
import { importPrivateKey } from "./import";
import { getPublicKey } from "./public-key";
import { valueOf } from "./test-fixtures";

describe("getPublicKey", () => {
  it("should return the public half with the private key's alg and kid", async () => {
    const pair = await generateKeyPair({ alg: "ES256", kid: "k1" });

    const publicKey = getPublicKey(pair.privateKey);

    expect(publicKey).toEqual({ kind: "public", alg: "ES256", kid: "k1" });
    expect(Object.isFrozen(publicKey)).toBe(true);
    expect(await exportPublicJwk(publicKey)).toEqual(await exportPublicJwk(pair.publicKey));
  });

  it("should return the same public key on every call", async () => {
    const { privateKey } = await generateKeyPair({ alg: "EdDSA" });

    expect(getPublicKey(privateKey)).toBe(getPublicKey(privateKey));
  });

  it("should verify tokens the private key signs, also when it is not extractable", async () => {
    const { privateKey } = await generateKeyPair({ alg: "RS256" });
    const token = await sign({ payload: { sub: "u1", exp: Math.floor(Date.now() / 1000) + 600 }, key: privateKey });

    const result = await createVerifier({ keys: createKeySet([getPublicKey(privateKey)]) })(token);

    expect(result.ok).toBe(true);
  });

  it("should give the public half of a private key imported alone", async () => {
    const source = await generateKeyPair({ alg: "ES384", extractable: true });
    const jwk = await exportPrivateJwk(source.privateKey);
    const privateKey = valueOf(await importPrivateKey(jwk, { alg: "ES384" }));

    expect(await exportPublicJwk(getPublicKey(privateKey))).toEqual(await exportPublicJwk(source.publicKey));
  });

  it("should throw a TypeError for a public key, a secret key or a look-alike", async () => {
    const pair = await generateKeyPair({ alg: "ES256" });
    const secret = await generateSecretKey({ alg: "HS256" });

    for (const key of [pair.publicKey, secret, { kind: "private", alg: "ES256", extractable: false }]) {
      expect(() => getPublicKey(key as PrivateKey)).toThrow(TypeError);
    }
  });

  it("should point exportPublicJwk callers holding a private key to getPublicKey", async () => {
    const { privateKey } = await generateKeyPair({ alg: "ES256" });

    await expect(exportPublicJwk(privateKey as never)).rejects.toThrow(/getPublicKey/);
  });
});
