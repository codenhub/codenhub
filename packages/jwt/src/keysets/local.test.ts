import { beforeAll, describe, expect, it } from "vitest";

import type { JwtHeader, PublicKey, SecretKey, VerificationKey } from "../core/types";
import { generateKeyPair, generateSecretKey } from "../keys";
import {
  EC_P256_PRIVATE_JWK,
  EC_P256_PUBLIC_JWK,
  ED25519_PUBLIC_JWK,
  HMAC_SECRET_JWK,
  RSA_1024_PUBLIC_JWK,
  RSA_2048_PUBLIC_JWK,
  valueOf,
} from "../keys/test-fixtures";
import { createKeySet, importKeySet } from "./local";

let ecA: PublicKey;
let ecA2: PublicKey;
let ecNoKid: PublicKey;
let ecNoKid2: PublicKey;
let secretA: SecretKey;

beforeAll(async () => {
  [ecA, ecA2, ecNoKid, ecNoKid2, secretA] = await Promise.all([
    generateKeyPair({ alg: "ES256", kid: "a" }).then((pair) => pair.publicKey),
    generateKeyPair({ alg: "ES256", kid: "a" }).then((pair) => pair.publicKey),
    generateKeyPair({ alg: "ES256" }).then((pair) => pair.publicKey),
    generateKeyPair({ alg: "ES256" }).then((pair) => pair.publicKey),
    generateSecretKey({ alg: "HS256", kid: "a" }),
  ]);
});

/** The `alg` and `kid` of the key a set selects for a header, or the failure codes. */
const selection = async (keys: { select(header: JwtHeader): Promise<unknown> }, header: JwtHeader) => {
  const result = (await keys.select(header)) as
    | { ok: true; value: VerificationKey }
    | { ok: false; error: { issues: readonly { code: string }[] } };
  return result.ok
    ? { kind: result.value.kind, alg: result.value.alg, kid: result.value.kid }
    : result.error.issues.map((issue) => issue.code);
};

describe("createKeySet", () => {
  it("should select from the keys it was given", async () => {
    const keys = createKeySet([ecA, secretA]);
    expect(await keys.select({ alg: "HS256", kid: "a" })).toEqual({ ok: true, value: secretA });
  });

  it("should return a frozen key set", () => {
    expect(Object.isFrozen(createKeySet([ecA]))).toBe(true);
  });

  it("should not change when the given array changes", async () => {
    const keys: VerificationKey[] = [ecA];
    const keySet = createKeySet(keys);
    keys.push(ecA2);
    expect(await keySet.select({ alg: "ES256", kid: "a" })).toEqual({ ok: true, value: ecA });
  });

  it("should accept two keys sharing a kid with different algs", () => {
    expect(() => createKeySet([ecA, secretA])).not.toThrow();
  });

  it("should throw TypeError for an empty array", () => {
    expect(() => createKeySet([])).toThrow(new TypeError("createKeySet: keys must be a non-empty array."));
  });

  it("should throw TypeError for a value that is not an array", () => {
    expect(() => createKeySet(ecA as unknown as VerificationKey[])).toThrow(
      new TypeError("createKeySet: keys must be a non-empty array."),
    );
  });

  it("should throw TypeError for a forged key object", () => {
    const forged = { kind: "public", alg: "ES256", kid: "a" } as const;
    expect(() => createKeySet([forged])).toThrow(TypeError);
  });

  it("should throw TypeError for a private key", async () => {
    const { privateKey } = await generateKeyPair({ alg: "ES256" });
    expect(() => createKeySet([privateKey as unknown as VerificationKey])).toThrow(
      new TypeError("createKeySet: keys must be public or secret keys, not private keys."),
    );
  });

  it("should throw TypeError for two keys with the same kid and alg", () => {
    expect(() => createKeySet([ecA, ecA2])).toThrow(
      new TypeError("createKeySet: two keys share the same kid and alg."),
    );
  });

  it("should throw TypeError for two keys without a kid and with the same alg", () => {
    expect(() => createKeySet([ecNoKid, ecNoKid2])).toThrow(
      new TypeError("createKeySet: two keys share the same kid and alg."),
    );
  });
});

describe("importKeySet", () => {
  it("should bind a JWK with alg to that algorithm only", async () => {
    const keys = valueOf(await importKeySet({ keys: [{ ...RSA_2048_PUBLIC_JWK, kid: "r", alg: "PS256" }] }));
    expect([
      await selection(keys, { alg: "PS256", kid: "r" }),
      await selection(keys, { alg: "RS256", kid: "r" }),
    ]).toEqual([{ kind: "public", alg: "PS256", kid: "r" }, ["alg_mismatch"]]);
  });

  it("should bind a JWK without alg to every algorithm its kty allows", async () => {
    const keys = valueOf(await importKeySet({ keys: [{ ...RSA_2048_PUBLIC_JWK, kid: "r" }] }));
    expect([
      await selection(keys, { alg: "RS256", kid: "r" }),
      await selection(keys, { alg: "PS256", kid: "r" }),
    ]).toEqual([
      { kind: "public", alg: "RS256", kid: "r" },
      { kind: "public", alg: "PS256", kid: "r" },
    ]);
  });

  it("should bind an Ed25519 JWK without alg to both EdDSA and Ed25519", async () => {
    const keys = valueOf(await importKeySet({ keys: [{ ...ED25519_PUBLIC_JWK, kid: "e" }] }));
    expect([
      await selection(keys, { alg: "EdDSA", kid: "e" }),
      await selection(keys, { alg: "Ed25519", kid: "e" }),
    ]).toEqual([
      { kind: "public", alg: "EdDSA", kid: "e" },
      { kind: "public", alg: "Ed25519", kid: "e" },
    ]);
  });

  it("should bind a JWK without alg only to the allowed algorithms", async () => {
    const keys = valueOf(
      await importKeySet({ keys: [{ ...RSA_2048_PUBLIC_JWK, kid: "r" }] }, { algorithms: ["PS256"] }),
    );
    expect(await selection(keys, { alg: "RS256", kid: "r" })).toEqual(["alg_mismatch"]);
  });

  it("should skip a JWK whose alg is not allowed", async () => {
    const keys = valueOf(
      await importKeySet({ keys: [{ ...EC_P256_PUBLIC_JWK, kid: "e", alg: "ES256" }] }, { algorithms: ["RS256"] }),
    );
    expect(await selection(keys, { alg: "ES256", kid: "e" })).toEqual(["unknown_kid"]);
  });

  it("should skip an oct JWK", async () => {
    const keys = valueOf(await importKeySet({ keys: [{ ...HMAC_SECRET_JWK, kid: "s" }] }));
    expect(await selection(keys, { alg: "HS256", kid: "s" })).toEqual(["unknown_kid"]);
  });

  it("should skip an oct JWK that names HS256", async () => {
    const keys = valueOf(await importKeySet({ keys: [{ ...HMAC_SECRET_JWK, kid: "s", alg: "HS256" }] }));
    expect(await selection(keys, { alg: "HS256", kid: "s" })).toEqual(["unknown_kid"]);
  });

  it("should skip a JWK for encryption", async () => {
    const keys = valueOf(await importKeySet({ keys: [{ ...EC_P256_PUBLIC_JWK, kid: "e", use: "enc" }] }));
    expect(await selection(keys, { alg: "ES256", kid: "e" })).toEqual(["unknown_kid"]);
  });

  it("should skip a JWK carrying private members", async () => {
    const keys = valueOf(await importKeySet({ keys: [{ ...EC_P256_PRIVATE_JWK, kid: "e" }] }));
    expect(await selection(keys, { alg: "ES256", kid: "e" })).toEqual(["unknown_kid"]);
  });

  it("should skip a weak JWK and keep the usable ones", async () => {
    const keys = valueOf(
      await importKeySet({
        keys: [
          { ...RSA_1024_PUBLIC_JWK, kid: "weak" },
          { ...EC_P256_PUBLIC_JWK, kid: "e" },
        ],
      }),
    );
    expect([
      await selection(keys, { alg: "RS256", kid: "weak" }),
      await selection(keys, { alg: "ES256", kid: "e" }),
    ]).toEqual([["unknown_kid"], { kind: "public", alg: "ES256", kid: "e" }]);
  });

  it("should skip entries that are not objects", async () => {
    const keys = valueOf(await importKeySet({ keys: [null, "x", 1, { ...EC_P256_PUBLIC_JWK, kid: "e" }] }));
    expect(await selection(keys, { alg: "ES256", kid: "e" })).toEqual({ kind: "public", alg: "ES256", kid: "e" });
  });

  it("should give an empty set when no key is usable", async () => {
    const keys = valueOf(await importKeySet({ keys: [] }));
    expect(await selection(keys, { alg: "ES256" })).toEqual(["no_matching_key"]);
  });

  it("should report ambiguous_key on selection for two JWKs with the same kid and alg", async () => {
    const jwk = { ...EC_P256_PUBLIC_JWK, kid: "e" };
    const keys = valueOf(await importKeySet({ keys: [jwk, jwk] }));
    expect(await selection(keys, { alg: "ES256", kid: "e" })).toEqual(["ambiguous_key"]);
  });

  it("should report too_large for more than 100 keys", async () => {
    const jwks = { keys: Array.from({ length: 101 }, () => EC_P256_PUBLIC_JWK) };
    expect(await importKeySet(jwks)).toEqual({
      ok: false,
      error: { issues: [{ code: "too_large", params: { limit: "keys", maximum: 100 } }] },
    });
  });

  it("should copy keys by index, never running the array's own iterator", async () => {
    const keys = [EC_P256_PUBLIC_JWK];
    Object.defineProperty(keys, Symbol.iterator, {
      value: () => {
        throw new Error("the array's iterator must not run");
      },
    });
    const result = await importKeySet({ keys });
    expect(result.ok && (await result.value.select({ alg: "ES256" })).ok).toBe(true);
  });

  it("should accept exactly 100 keys", async () => {
    const jwks = { keys: Array.from({ length: 100 }, () => EC_P256_PUBLIC_JWK) };
    expect((await importKeySet(jwks)).ok).toBe(true);
  });

  it.each([null, "jwks", 1, [EC_P256_PUBLIC_JWK]])("should report malformed for a JWKS of %j", async (jwks) => {
    expect(await importKeySet(jwks)).toEqual({ ok: false, error: { issues: [{ code: "malformed" }] } });
  });

  it.each([{}, { keys: {} }, { keys: "x" }])("should report malformed at keys for %j", async (jwks) => {
    expect(await importKeySet(jwks)).toEqual({ ok: false, error: { issues: [{ code: "malformed", path: ["keys"] }] } });
  });

  it("should not run a getter on the JWKS", async () => {
    const jwks = {
      get keys(): never {
        throw new Error("getter ran");
      },
    };
    expect(await importKeySet(jwks)).toEqual({ ok: false, error: { issues: [{ code: "malformed", path: ["keys"] }] } });
  });

  it("should return a frozen result", async () => {
    const result = await importKeySet({ keys: [] });
    expect([Object.isFrozen(result), Object.isFrozen(valueOf(result))]).toEqual([true, true]);
  });

  it.each([
    null,
    "ES256",
    { algorithms: [] },
    { algorithms: ["HS256"] },
    { algorithms: ["none"] },
    { algorithms: "ES256" },
  ])("should throw TypeError for options %j", async (options) => {
    await expect(importKeySet({ keys: [] }, options as never)).rejects.toThrow(TypeError);
  });
});
