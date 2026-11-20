import { describe, expect, it } from "vitest";

import { exportPublicJwk, generateKeyPair } from "../index";
import { importKeySet } from "../keysets/local";
import { createRemoteKeySet } from "../keysets/remote";
import { createDecrypter, createJweKeySet } from "./decrypt";
import { encrypt } from "./encrypt";
import { exportJwePublicJwk, generateJweKeyPair } from "./keys";

const withoutAlgAndUse = (jwk: object): Record<string, unknown> =>
  Object.fromEntries(Object.entries(jwk).filter(([name]) => name !== "alg" && name !== "use"));

/** The value of a success; a failure fails the test with its issues. */
const valueOf = <T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!result.ok) {
    throw new Error(`expected success, got ${JSON.stringify(result.error)}`);
  }
  return result.value;
};

describe("importKeySet with use enc", () => {
  it("should import each encryption JWK as a JWE public key the decrypter's private key opens", async () => {
    const pair = await generateJweKeyPair({ alg: "ECDH-ES+A128KW", crv: "X25519", kid: "x" });
    const jwk = await exportJwePublicJwk(pair.publicKey);
    const set = await importKeySet({ keys: [jwk] }, { use: "enc" });

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

    const all = await importKeySet({ keys }, { use: "enc" });
    const narrowed = await importKeySet({ keys }, { use: "enc", algorithms: ["ECDH-ES+A256KW", "RSA-OAEP-256"] });

    expect(all.ok && all.value.keys.map((key) => `${key.kid} ${key.alg}`).sort()).toEqual([
      "ec ECDH-ES",
      "ec ECDH-ES+A128KW",
      "ec ECDH-ES+A256KW",
      "rsa RSA-OAEP",
      "rsa RSA-OAEP-256",
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

    const set = await importKeySet({ keys: [unmarked, signingJwk, { ...signingJwk, use: "sig" }] }, { use: "enc" });

    expect(set.ok && set.value.keys).toEqual([]);
  });

  it("should refuse an algorithm list that is not asymmetric key management, and issuer with use enc", async () => {
    await expect(importKeySet({ keys: [] }, { use: "enc", algorithms: ["A128KW"] as never })).rejects.toThrow(
      TypeError,
    );
    await expect(importKeySet({ keys: [] }, { use: "enc", algorithms: [] })).rejects.toThrow(TypeError);
    await expect(importKeySet({ keys: [] }, { use: "enc", issuer: "x" } as never)).rejects.toThrow(TypeError);
    await expect(importKeySet({ keys: [] }, { use: "both" } as never)).rejects.toThrow(TypeError);
  });

  it("should keep importing signing keys by default and with use sig", async () => {
    const signing = await generateKeyPair({ alg: "ES256", extractable: true });
    const jwk = await exportPublicJwk(signing.publicKey);

    expect((await importKeySet({ keys: [jwk] }, { use: "sig" })).ok).toBe(true);
    expect((await importKeySet({ keys: [jwk] })).ok).toBe(true);
  });
});

describe("createRemoteKeySet with use enc", () => {
  it("should fetch encryption keys and select one to encrypt to", async () => {
    const pair = await generateJweKeyPair({ alg: "RSA-OAEP-256", kid: "r1" });
    const jwk = await exportJwePublicJwk(pair.publicKey);
    let fetches = 0;
    const keys = createRemoteKeySet({
      url: "https://recipient.example/jwks.json",
      use: "enc",
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

  it("should refuse issuer and a symmetric algorithm with use enc", () => {
    expect(() =>
      createRemoteKeySet({ url: "https://recipient.example/jwks.json", use: "enc", issuer: "x" } as never),
    ).toThrow(TypeError);
    expect(() =>
      createRemoteKeySet({ url: "https://recipient.example/jwks.json", use: "enc", algorithms: ["dir"] } as never),
    ).toThrow(TypeError);
  });
});
