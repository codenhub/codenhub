import { describe, expect, it } from "vitest";

import { exportPublicJwk, generateKeyPair } from "../index";
import { importKeySet } from "../keysets/local";
import { createRemoteEncryptionKeySet, createRemoteKeySet } from "../keysets/remote";
import { createDecrypter, createJweKeySet } from "./decrypt";
import { encrypt } from "./encrypt";
import { exportJwePublicJwk, generateJweKeyPair } from "./keys";
import { importEncryptionKeySet } from "./keyset";

const withoutAlgAndUse = (jwk: object): Record<string, unknown> =>
  Object.fromEntries(Object.entries(jwk).filter(([name]) => name !== "alg" && name !== "use"));

/** The value of a success; a failure fails the test with its issues. */
const valueOf = <T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!result.ok) {
    throw new Error(`expected success, got ${JSON.stringify(result.error)}`);
  }
  return result.value;
};

describe("importEncryptionKeySet", () => {
  it("should import each encryption JWK as a JWE public key the decrypter's private key opens", async () => {
    const pair = await generateJweKeyPair({ alg: "ECDH-ES+A128KW", crv: "X25519", kid: "x" });
    const jwk = await exportJwePublicJwk(pair.publicKey);
    const set = await importEncryptionKeySet({ keys: [jwk] });

    const keys = valueOf(set);
    const selected = valueOf(await keys.select({ alg: "ECDH-ES+A128KW", kid: "x" }));
    const token = await encrypt({ plaintext: "hi", key: selected, enc: "A128GCM" });

    expect(keys.keys).toEqual([{ kind: "jwe-public", alg: "ECDH-ES+A128KW", kid: "x" }]);
    expect((await createDecrypter({ keys: createJweKeySet([pair.privateKey]) })(token)).ok).toBe(true);
  });

  it("should bind a JWK without alg to each allowed algorithm its type fits", async () => {
    const ec = await generateJweKeyPair({ alg: "ECDH-ES", kid: "ec" });
    const rsa = await generateJweKeyPair({ alg: "RSA-OAEP", kid: "rsa" });
    const keys = [
      { ...withoutAlgAndUse({ ...(await exportJwePublicJwk(ec.publicKey)) }), use: "enc" },
      { ...withoutAlgAndUse({ ...(await exportJwePublicJwk(rsa.publicKey)) }), key_ops: ["encrypt"] },
    ];

    const all = await importEncryptionKeySet({ keys });
    const narrowed = await importEncryptionKeySet({ keys }, { algorithms: ["ECDH-ES+A256KW", "RSA-OAEP-256"] });

    expect(all.ok && all.value.keys.map((key) => `${key.kid} ${key.alg}`).sort()).toEqual([
      "ec ECDH-ES",
      "ec ECDH-ES+A128KW",
      "ec ECDH-ES+A256KW",
      "rsa RSA-OAEP",
      "rsa RSA-OAEP-256",
      "rsa RSA-OAEP-384",
      "rsa RSA-OAEP-512",
    ]);
    expect(narrowed.ok && narrowed.value.keys.map((key) => `${key.kid} ${key.alg}`).sort()).toEqual([
      "ec ECDH-ES+A256KW",
      "rsa RSA-OAEP-256",
    ]);
  });

  it("should skip a JWK that does not say it encrypts, and every signing key", async () => {
    const ec = await generateJweKeyPair({ alg: "ECDH-ES" });
    const signing = await generateKeyPair({ alg: "ES256" });
    const unmarked = withoutAlgAndUse({ ...(await exportJwePublicJwk(ec.publicKey)) });
    const signingJwk = await exportPublicJwk(signing.publicKey);

    const set = await importEncryptionKeySet({ keys: [unmarked, signingJwk, { ...signingJwk, use: "sig" }] });

    expect(set.ok && set.value.keys).toEqual([]);
  });

  it("should refuse an algorithm list that is not asymmetric key management, and the signing options", async () => {
    await expect(importEncryptionKeySet({ keys: [] }, { algorithms: ["A128KW"] as never })).rejects.toThrow(
      /^importEncryptionKeySet: options\.algorithms must be a non-empty array of RSA-OAEP, .*\.$/,
    );
    await expect(importEncryptionKeySet({ keys: [] }, { algorithms: [] })).rejects.toThrow(TypeError);
    await expect(importEncryptionKeySet({ keys: [] }, { issuer: "x" } as never)).rejects.toThrow(
      new TypeError("importEncryptionKeySet: options.issuer is not an option."),
    );
    await expect(importEncryptionKeySet({ keys: [] }, { use: "enc" } as never)).rejects.toThrow(
      new TypeError("importEncryptionKeySet: options.use is not an option."),
    );
    await expect(importEncryptionKeySet({ keys: [] }, null as never)).rejects.toThrow(
      new TypeError("importEncryptionKeySet: options must be an object."),
    );
  });

  it("should leave encryption keys out of importKeySet, which has no use option", async () => {
    const pair = await generateJweKeyPair({ alg: "ECDH-ES", kid: "e" });
    const signing = await generateKeyPair({ alg: "ES256", extractable: true });
    const jwks = { keys: [await exportJwePublicJwk(pair.publicKey), await exportPublicJwk(signing.publicKey)] };

    expect(valueOf(await importKeySet(jwks)).keys.map((key) => key.alg)).toEqual(["ES256"]);
    await expect(importKeySet(jwks, { use: "enc" } as never)).rejects.toThrow(
      new TypeError("importKeySet: options.use is not an option."),
    );
  });
});

describe("createRemoteEncryptionKeySet", () => {
  it("should fetch encryption keys and select one to encrypt to", async () => {
    const pair = await generateJweKeyPair({ alg: "RSA-OAEP-256", kid: "r1" });
    const jwk = await exportJwePublicJwk(pair.publicKey);
    let fetches = 0;
    const keys = createRemoteEncryptionKeySet({
      url: "https://recipient.example/jwks.json",
      fetch: async () => {
        fetches += 1;
        return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
      },
    });

    const selected = await keys.select({ alg: "RSA-OAEP-256", kid: "r1" });
    expect(selected).toEqual({ ok: true, value: { kind: "jwe-public", alg: "RSA-OAEP-256", kid: "r1" } });
    expect(await keys.select({ alg: "RSA-OAEP", kid: "r1" })).toMatchObject({ ok: false });
    expect(fetches).toBeGreaterThanOrEqual(1);

    const token = await encrypt({
      plaintext: "x",
      key: selected.ok ? selected.value : (undefined as never),
      enc: "A256GCM",
    });
    expect((await createDecrypter({ keys: createJweKeySet([pair.privateKey]) })(token)).ok).toBe(true);
  });

  it("should refuse issuer, use and a symmetric algorithm, naming itself", () => {
    const url = "https://recipient.example/jwks.json";
    expect(() => createRemoteEncryptionKeySet({ url, issuer: "x" } as never)).toThrow(
      new TypeError("createRemoteEncryptionKeySet: options.issuer is not an option."),
    );
    expect(() => createRemoteEncryptionKeySet({ url, use: "enc" } as never)).toThrow(
      new TypeError("createRemoteEncryptionKeySet: options.use is not an option."),
    );
    expect(() => createRemoteEncryptionKeySet({ url, algorithms: ["dir"] } as never)).toThrow(TypeError);
    expect(() => createRemoteEncryptionKeySet({ url, cacheTtl: 0 })).toThrow(
      new TypeError("createRemoteEncryptionKeySet: options.cacheTtl must be an integer at least 1."),
    );
  });

  it("should leave encryption keys out of createRemoteKeySet, which has no use option", async () => {
    const pair = await generateJweKeyPair({ alg: "ECDH-ES", kid: "e" });
    const url = "https://issuer.example/jwks.json";
    const fetch = async () =>
      new Response(JSON.stringify({ keys: [await exportJwePublicJwk(pair.publicKey)] }), { status: 200 });

    expect(await createRemoteKeySet({ url, fetch }).select({ alg: "ES256", kid: "e" })).toEqual({
      ok: false,
      error: { issues: [{ code: "key_fetch_failed", params: { reason: "no_usable_keys" } }] },
    });
    expect(() => createRemoteKeySet({ url, use: "enc" } as never)).toThrow(
      new TypeError("createRemoteKeySet: options.use is not an option."),
    );
  });
});
