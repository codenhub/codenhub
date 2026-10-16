import { describe, expect, it } from "vitest";

import type { AsymmetricAlgorithm } from "../core/types";
import { decodeBase64Url, encodeBase64Url } from "../encoding";
import { importPrivateKey, importPublicKey, importSecretKey } from "./import";
import { getKeyEntry } from "./registry";
import {
  EC_P256_PRIVATE_JWK,
  EC_P256_PUBLIC_JWK,
  ED25519_PRIVATE_JWK,
  ED25519_PUBLIC_JWK,
  HMAC_SECRET_JWK,
  issuesOf,
  RSA_1024_PUBLIC_JWK,
  RSA_2048_PRIVATE_JWK,
  RSA_2048_PUBLIC_JWK,
  valueOf,
  withMembers,
} from "./test-fixtures";

interface AlgorithmCase {
  readonly alg: AsymmetricAlgorithm;
  readonly publicJwk: Record<string, string>;
  readonly privateJwk: Record<string, string>;
  /** A material member whose value the tests corrupt. */
  readonly materialMember: string;
  readonly otherKty: string;
}

const CASES: readonly AlgorithmCase[] = [
  {
    alg: "ES256",
    publicJwk: EC_P256_PUBLIC_JWK,
    privateJwk: EC_P256_PRIVATE_JWK,
    materialMember: "x",
    otherKty: "RSA",
  },
  { alg: "EdDSA", publicJwk: ED25519_PUBLIC_JWK, privateJwk: ED25519_PRIVATE_JWK, materialMember: "x", otherKty: "EC" },
  {
    alg: "Ed25519",
    publicJwk: ED25519_PUBLIC_JWK,
    privateJwk: ED25519_PRIVATE_JWK,
    materialMember: "x",
    otherKty: "EC",
  },
  {
    alg: "RS256",
    publicJwk: RSA_2048_PUBLIC_JWK,
    privateJwk: RSA_2048_PRIVATE_JWK,
    materialMember: "n",
    otherKty: "EC",
  },
  {
    alg: "PS256",
    publicJwk: RSA_2048_PUBLIC_JWK,
    privateJwk: RSA_2048_PRIVATE_JWK,
    materialMember: "n",
    otherKty: "oct",
  },
];
const CURVE_CASES = CASES.filter((testCase) => testCase.publicJwk.crv !== undefined);

/** Every material string in the fixtures, none of which may appear in an issue. */
const MATERIAL = [...CASES.flatMap((c) => Object.values(c.privateJwk)), HMAC_SECRET_JWK.k].filter(
  (value) => value.length > 8,
);

/** The fixture material strings that appear in `value`'s JSON form. */
const materialIn = (value: unknown): string[] => {
  const text = JSON.stringify(value);
  return MATERIAL.filter((material) => text.includes(material));
};

describe.each(CASES)("importPublicKey for $alg", ({ alg, publicJwk, materialMember, otherKty }) => {
  it("should return a frozen public key bound to the algorithm", async () => {
    const result = await importPublicKey(publicJwk, { alg });
    expect(result).toEqual({ ok: true, value: { kind: "public", alg } });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(valueOf(result))).toBe(true);
  });

  it("should take kid from the JWK", async () => {
    expect(valueOf(await importPublicKey({ ...publicJwk, kid: "k1" }, { alg }))).toEqual({
      kind: "public",
      alg,
      kid: "k1",
    });
  });

  it("should accept matching alg, use sig, and key_ops including verify", async () => {
    const jwk = { ...publicJwk, alg, use: "sig", key_ops: ["verify"] };
    expect((await importPublicKey(jwk, { alg })).ok).toBe(true);
  });

  it.each([null, undefined, "jwk", 42, [], new Map(), Object.create({ kty: "EC" })])(
    "should report invalid_key for a non-plain-object JWK (%s)",
    async (jwk) => {
      expect(issuesOf(await importPublicKey(jwk, { alg }))).toEqual([{ code: "invalid_key" }]);
    },
  );

  it("should report invalid_key with path kty when kty is missing", async () => {
    expect(issuesOf(await importPublicKey(withMembers(publicJwk, { kty: undefined }), { alg }))).toEqual([
      { code: "invalid_key", path: ["kty"] },
    ]);
  });

  it("should report invalid_key with path kty when kty is not a string", async () => {
    expect(issuesOf(await importPublicKey(withMembers(publicJwk, { kty: 1 }), { alg }))).toEqual([
      { code: "invalid_key", path: ["kty"] },
    ]);
  });

  it("should report unsupported_key with path kty for a kty the algorithm does not use", async () => {
    expect(issuesOf(await importPublicKey(withMembers(publicJwk, { kty: otherKty }), { alg }))).toEqual([
      { code: "unsupported_key", path: ["kty"] },
    ]);
  });

  it("should report alg_mismatch with path alg when the JWK names another algorithm", async () => {
    const other = alg === "ES256" ? "RS256" : "ES256";
    expect(issuesOf(await importPublicKey({ ...publicJwk, alg: other }, { alg }))).toEqual([
      { code: "alg_mismatch", path: ["alg"] },
    ]);
  });

  it("should report alg_mismatch for a JWK alg of none", async () => {
    expect(issuesOf(await importPublicKey({ ...publicJwk, alg: "none" }, { alg }))).toEqual([
      { code: "alg_mismatch", path: ["alg"] },
    ]);
  });

  it("should report invalid_key with path alg when alg is not a string", async () => {
    expect(issuesOf(await importPublicKey({ ...publicJwk, alg: 1 }, { alg }))).toEqual([
      { code: "invalid_key", path: ["alg"] },
    ]);
  });

  it("should report wrong_use with path use for use enc", async () => {
    expect(issuesOf(await importPublicKey({ ...publicJwk, use: "enc" }, { alg }))).toEqual([
      { code: "wrong_use", path: ["use"] },
    ]);
  });

  it("should report invalid_key with path use when use is not a string", async () => {
    expect(issuesOf(await importPublicKey({ ...publicJwk, use: ["sig"] }, { alg }))).toEqual([
      { code: "invalid_key", path: ["use"] },
    ]);
  });

  it("should report wrong_use with path key_ops when key_ops lacks verify", async () => {
    expect(issuesOf(await importPublicKey({ ...publicJwk, key_ops: ["sign"] }, { alg }))).toEqual([
      { code: "wrong_use", path: ["key_ops"] },
    ]);
  });

  it("should report invalid_key with path key_ops when key_ops is not an array of strings", async () => {
    expect(issuesOf(await importPublicKey({ ...publicJwk, key_ops: "verify" }, { alg }))).toEqual([
      { code: "invalid_key", path: ["key_ops"] },
    ]);
  });

  it("should report invalid_key with path kid when kid is not a string", async () => {
    expect(issuesOf(await importPublicKey({ ...publicJwk, kid: 7 }, { alg }))).toEqual([
      { code: "invalid_key", path: ["kid"] },
    ]);
  });

  it.each(["d", "p", "q", "dp", "dq", "qi", "oth", "k"])(
    "should report unexpected_private_key with path %s when a private member is present",
    async (member) => {
      expect(issuesOf(await importPublicKey({ ...publicJwk, [member]: "AQAB" }, { alg }))).toEqual([
        { code: "unexpected_private_key", path: [member] },
      ]);
    },
  );

  it("should report invalid_key for a material member that is not base64url", async () => {
    const jwk = { ...publicJwk, [materialMember]: `${publicJwk[materialMember].slice(1)}=` };
    expect(issuesOf(await importPublicKey(jwk, { alg }))).toEqual([{ code: "invalid_key", path: [materialMember] }]);
  });

  it("should report invalid_key for a missing material member", async () => {
    const jwk = withMembers(publicJwk, { [materialMember]: undefined });
    expect(issuesOf(await importPublicKey(jwk, { alg }))).toEqual([{ code: "invalid_key", path: [materialMember] }]);
  });

  it("should report invalid_key for a JWK whose members are getters", async () => {
    const jwk = { ...publicJwk };
    Object.defineProperty(jwk, "kty", { get: () => publicJwk.kty, enumerable: true });
    expect(issuesOf(await importPublicKey(jwk, { alg }))).toEqual([{ code: "invalid_key" }]);
  });

  it("should report invalid_key for a Proxy whose traps throw", async () => {
    const hostile = new Proxy(
      {},
      {
        getOwnPropertyDescriptor: () => {
          throw new Error("trap");
        },
      },
    );
    expect(issuesOf(await importPublicKey(hostile, { alg }))).toEqual([{ code: "invalid_key" }]);
  });

  it("should not echo key material in issues", async () => {
    const results = await Promise.all([
      importPublicKey({ ...publicJwk, use: "enc" }, { alg }),
      importPublicKey({ ...publicJwk, [materialMember]: `${publicJwk[materialMember]}A` }, { alg }),
      importPublicKey({ ...publicJwk, d: publicJwk[materialMember] }, { alg }),
    ]);
    expect(materialIn(results)).toEqual([]);
  });
});

describe.each(CURVE_CASES)("importPublicKey curve checks for $alg", ({ alg, publicJwk }) => {
  it("should report invalid_key with path crv when crv is missing", async () => {
    expect(issuesOf(await importPublicKey(withMembers(publicJwk, { crv: undefined }), { alg }))).toEqual([
      { code: "invalid_key", path: ["crv"] },
    ]);
  });

  it("should report unsupported_key with path crv for another curve", async () => {
    expect(issuesOf(await importPublicKey({ ...publicJwk, crv: "P-384" }, { alg }))).toEqual([
      { code: "unsupported_key", path: ["crv"] },
    ]);
  });

  it("should report invalid_key with path x when x is not 32 bytes", async () => {
    const jwk = { ...publicJwk, x: encodeBase64Url(new Uint8Array(31)) };
    expect(issuesOf(await importPublicKey(jwk, { alg }))).toEqual([{ code: "invalid_key", path: ["x"] }]);
  });
});

describe("importPublicKey for ES256 only", () => {
  it("should report invalid_key with path y when y is not 32 bytes", async () => {
    const jwk = { ...EC_P256_PUBLIC_JWK, y: encodeBase64Url(new Uint8Array(33)) };
    expect(issuesOf(await importPublicKey(jwk, { alg: "ES256" }))).toEqual([{ code: "invalid_key", path: ["y"] }]);
  });

  it("should report invalid_key without a path for a point not on the curve", async () => {
    const jwk = { ...EC_P256_PUBLIC_JWK, y: encodeBase64Url(new Uint8Array(32).fill(7)) };
    expect(issuesOf(await importPublicKey(jwk, { alg: "ES256" }))).toEqual([{ code: "invalid_key" }]);
  });
});

describe("importPublicKey for RSA", () => {
  it("should report weak_key with minimum 2048 for a 1024-bit modulus", async () => {
    expect(issuesOf(await importPublicKey(RSA_1024_PUBLIC_JWK, { alg: "RS256" }))).toEqual([
      { code: "weak_key", path: ["n"], params: { minimum: 2048 } },
    ]);
  });

  it("should count bits after stripping leading zero octets of the modulus", async () => {
    const modulus = new Uint8Array(257);
    modulus[1] = 1;
    const jwk = { ...RSA_2048_PUBLIC_JWK, n: encodeBase64Url(modulus) };
    expect(issuesOf(await importPublicKey(jwk, { alg: "RS256" }))).toEqual([
      { code: "weak_key", path: ["n"], params: { minimum: 2048 } },
    ]);
  });

  it("should accept a 2048-bit modulus with a leading zero octet and size signatures by the modulus", async () => {
    const modulus = decodeBase64Url(RSA_2048_PUBLIC_JWK.n) ?? new Uint8Array();
    const padded = new Uint8Array([0, ...modulus]);
    const key = valueOf(
      await importPublicKey({ ...RSA_2048_PUBLIC_JWK, n: encodeBase64Url(padded) }, { alg: "PS256" }),
    );
    expect(getKeyEntry(key).signatureLength).toBe(256);
  });

  it("should report unsupported_key with maximum 8192 for a larger modulus", async () => {
    const modulus = new Uint8Array(1025).fill(0xff);
    const jwk = { ...RSA_2048_PUBLIC_JWK, n: encodeBase64Url(modulus) };
    expect(issuesOf(await importPublicKey(jwk, { alg: "RS256" }))).toEqual([
      { code: "unsupported_key", path: ["n"], params: { maximum: 8192 } },
    ]);
  });

  it("should report invalid_key with path n for an all-zero modulus", async () => {
    const jwk = { ...RSA_2048_PUBLIC_JWK, n: encodeBase64Url(new Uint8Array(256)) };
    expect(issuesOf(await importPublicKey(jwk, { alg: "RS256" }))).toEqual([{ code: "invalid_key", path: ["n"] }]);
  });

  it("should report invalid_key with path e for an empty exponent", async () => {
    expect(issuesOf(await importPublicKey({ ...RSA_2048_PUBLIC_JWK, e: "" }, { alg: "RS256" }))).toEqual([
      { code: "invalid_key", path: ["e"] },
    ]);
  });

  it("should report invalid_key for a modulus with non-canonical trailing bits", async () => {
    const jwk = { ...RSA_2048_PUBLIC_JWK, n: `${RSA_2048_PUBLIC_JWK.n.slice(0, -1)}9` };
    expect(issuesOf(await importPublicKey(jwk, { alg: "RS256" }))).toEqual([{ code: "invalid_key", path: ["n"] }]);
  });

  it.each([
    ["1", "AQ"],
    ["2", "Ag"],
    ["4", "BA"],
  ])("should report invalid_key with path e for the public exponent %s", async (_, e) => {
    expect(issuesOf(await importPublicKey({ ...RSA_2048_PUBLIC_JWK, e }, { alg: "RS256" }))).toEqual([
      { code: "invalid_key", path: ["e"] },
    ]);
  });

  it.each([
    ["3", "Aw"],
    ["65537", "AQAB"],
    ["65537 with a leading zero octet", "AAEAAQ"],
  ])("should accept the public exponent %s", async (_, e) => {
    const result = await importPublicKey({ ...RSA_2048_PUBLIC_JWK, e }, { alg: "RS256" });
    expect([result.ok, issuesOf(result)]).toEqual([true, []]);
  });

  it("should report invalid_key with path e for a public exponent longer than 4 bytes", async () => {
    const e = encodeBase64Url(new Uint8Array([1, 0, 0, 0, 1]));
    expect(issuesOf(await importPublicKey({ ...RSA_2048_PUBLIC_JWK, e }, { alg: "RS256" }))).toEqual([
      { code: "invalid_key", path: ["e"] },
    ]);
  });
});

describe("importPublicKey options", () => {
  it.each([undefined, null, "ES256"])("should throw TypeError for options %s", async (options) => {
    await expect(importPublicKey(EC_P256_PUBLIC_JWK, options as never)).rejects.toThrow(TypeError);
  });

  it.each(["HS256", "none", "es256", undefined])("should throw TypeError for alg %s", async (alg) => {
    await expect(importPublicKey(EC_P256_PUBLIC_JWK, { alg } as never)).rejects.toThrow(TypeError);
  });
});

describe.each(CASES)("importPrivateKey for $alg", ({ alg, privateJwk }) => {
  it("should return a frozen, non-extractable private key by default", async () => {
    const result = await importPrivateKey(privateJwk, { alg });
    expect(result).toEqual({ ok: true, value: { kind: "private", alg, extractable: false } });
    expect(Object.isFrozen(valueOf(result))).toBe(true);
  });

  it("should honor extractable: true", async () => {
    expect(valueOf(await importPrivateKey(privateJwk, { alg, extractable: true })).extractable).toBe(true);
  });

  it("should report invalid_key with path d when d is missing", async () => {
    expect(issuesOf(await importPrivateKey(withMembers(privateJwk, { d: undefined }), { alg }))).toEqual([
      { code: "invalid_key", path: ["d"] },
    ]);
  });

  it("should report wrong_use with path key_ops when key_ops lacks sign", async () => {
    expect(issuesOf(await importPrivateKey({ ...privateJwk, key_ops: ["verify"] }, { alg }))).toEqual([
      { code: "wrong_use", path: ["key_ops"] },
    ]);
  });

  it("should show no material in JSON.stringify of the key", async () => {
    const key = valueOf(await importPrivateKey({ ...privateJwk, kid: "k1" }, { alg }));
    expect(JSON.stringify(key)).toBe(`{"kind":"private","alg":"${alg}","kid":"k1","extractable":false}`);
  });
});

describe("importPrivateKey for RSA", () => {
  it.each(["p", "q", "dp", "dq", "qi"])(
    "should report invalid_key with path %s when that CRT member is missing",
    async (member) => {
      expect(
        issuesOf(await importPrivateKey(withMembers(RSA_2048_PRIVATE_JWK, { [member]: undefined }), { alg: "RS256" })),
      ).toEqual([{ code: "invalid_key", path: [member] }]);
    },
  );

  it("should report invalid_key with path e for a public exponent of 1", async () => {
    expect(issuesOf(await importPrivateKey(withMembers(RSA_2048_PRIVATE_JWK, { e: "AQ" }), { alg: "RS256" }))).toEqual([
      { code: "invalid_key", path: ["e"] },
    ]);
  });

  it("should report unsupported_key with path oth for a multi-prime key", async () => {
    expect(issuesOf(await importPrivateKey({ ...RSA_2048_PRIVATE_JWK, oth: [] }, { alg: "RS256" }))).toEqual([
      { code: "unsupported_key", path: ["oth"] },
    ]);
  });
});

describe("importPrivateKey options", () => {
  it("should throw TypeError for a non-boolean extractable", async () => {
    await expect(importPrivateKey(EC_P256_PRIVATE_JWK, { alg: "ES256", extractable: "yes" } as never)).rejects.toThrow(
      TypeError,
    );
  });

  it("should throw TypeError for alg HS256", async () => {
    await expect(importPrivateKey(HMAC_SECRET_JWK, { alg: "HS256" } as never)).rejects.toThrow(TypeError);
  });
});

describe("importSecretKey", () => {
  it("should import 32 raw bytes as a frozen secret key with the kid option", async () => {
    const result = await importSecretKey(new Uint8Array(32).fill(1), { alg: "HS256", kid: "s1" });
    expect(result).toEqual({ ok: true, value: { kind: "secret", alg: "HS256", kid: "s1", extractable: false } });
    expect(Object.isFrozen(valueOf(result))).toBe(true);
  });

  it("should report weak_key with minimum 32 for 31 raw bytes", async () => {
    expect(issuesOf(await importSecretKey(new Uint8Array(31), { alg: "HS256" }))).toEqual([
      { code: "weak_key", params: { minimum: 32 } },
    ]);
  });

  it("should import an oct JWK, taking kid from the JWK", async () => {
    const result = await importSecretKey({ ...HMAC_SECRET_JWK, kid: "j1" }, { alg: "HS256", kid: "ignored" });
    expect(result).toEqual({ ok: true, value: { kind: "secret", alg: "HS256", kid: "j1", extractable: false } });
  });

  it("should report weak_key with path k for a 31-byte oct JWK", async () => {
    const jwk = { kty: "oct", k: encodeBase64Url(new Uint8Array(31)) };
    expect(issuesOf(await importSecretKey(jwk, { alg: "HS256" }))).toEqual([
      { code: "weak_key", path: ["k"], params: { minimum: 32 } },
    ]);
  });

  it("should accept a 32-byte oct JWK", async () => {
    const jwk = { kty: "oct", k: encodeBase64Url(new Uint8Array(32).fill(9)) };
    expect((await importSecretKey(jwk, { alg: "HS256" })).ok).toBe(true);
  });

  it("should report unsupported_key with path kty for an asymmetric JWK", async () => {
    expect(issuesOf(await importSecretKey(EC_P256_PRIVATE_JWK, { alg: "HS256" }))).toEqual([
      { code: "unsupported_key", path: ["kty"] },
    ]);
  });

  it("should report wrong_use with path key_ops when key_ops has neither sign nor verify", async () => {
    expect(issuesOf(await importSecretKey({ ...HMAC_SECRET_JWK, key_ops: ["encrypt"] }, { alg: "HS256" }))).toEqual([
      { code: "wrong_use", path: ["key_ops"] },
    ]);
  });

  it("should report alg_mismatch with path alg for an oct JWK naming another algorithm", async () => {
    expect(issuesOf(await importSecretKey({ ...HMAC_SECRET_JWK, alg: "HS512" }, { alg: "HS256" }))).toEqual([
      { code: "alg_mismatch", path: ["alg"] },
    ]);
  });

  it("should report invalid_key for input that is neither bytes nor an object", async () => {
    expect(issuesOf(await importSecretKey("a secret string of more than 32 chars", { alg: "HS256" }))).toEqual([
      { code: "invalid_key" },
    ]);
  });

  it("should not echo the secret in issues", async () => {
    const result = await importSecretKey({ ...HMAC_SECRET_JWK, use: "enc" }, { alg: "HS256" });
    expect(materialIn(result)).toEqual([]);
  });

  it.each([{ alg: "RS256" }, { alg: "HS256", kid: 1 }, { alg: "HS256", extractable: 1 }])(
    "should throw TypeError for options %o",
    async (options) => {
      await expect(importSecretKey(new Uint8Array(32), options as never)).rejects.toThrow(TypeError);
    },
  );
});

describe("imported key issues", () => {
  it("should be deeply frozen", async () => {
    const result = await importPublicKey(RSA_1024_PUBLIC_JWK, { alg: "RS256" });
    const [issue] = issuesOf(result);
    expect(
      [result, result.ok ? null : result.error, issuesOf(result), issue, issue.path, issue.params].every(
        Object.isFrozen,
      ),
    ).toBe(true);
  });
});
