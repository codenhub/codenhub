import { beforeAll, describe, expect, it } from "vitest";

import {
  createDecrypter,
  createJweKeySet,
  createKeySet,
  encrypt,
  exportSecretJwk,
  generateJweKeyPair,
  generateJweSecretKey,
  generateKeyPair,
  generateSecretKey,
  importKeySet,
  jwkThumbprint,
  sign,
  type Decrypter,
  type JweKeyPair,
  type JweSecretKey,
} from "../../src";
import { base64Url, failure, segmentOf, withSegment } from "./support";

/*
 * Tokens an attacker can send to a decrypter. Each must come back as a failure, never a throw, and the
 * failures a padding or unwrap oracle would tell apart must be identical (RFC 7516 §11.5).
 */

let rsa: JweKeyPair;
let p256: JweKeyPair;
let x25519: JweKeyPair;
let kw: JweSecretKey;
let dirKey: JweSecretKey;
let decrypt: Decrypter;

beforeAll(async () => {
  [rsa, p256, x25519, kw, dirKey] = await Promise.all([
    generateJweKeyPair({ alg: "RSA-OAEP-256", kid: "rsa" }),
    generateJweKeyPair({ alg: "ECDH-ES", crv: "P-256", kid: "p256" }),
    generateJweKeyPair({ alg: "ECDH-ES+A128KW", crv: "X25519", kid: "x25519" }),
    generateJweSecretKey({ alg: "A128KW", kid: "kw" }),
    generateJweSecretKey({ alg: "dir", enc: "A128CBC-HS256", kid: "dir" }),
  ]);
  decrypt = createDecrypter({
    keys: createJweKeySet([rsa.privateKey, p256.privateKey, x25519.privateKey, kw, dirKey]),
  });
});

const DECRYPTION_FAILED = failure({ code: "decryption_failed" });
const MALFORMED_EPK = failure({ code: "malformed", path: ["header", "epk"] });

const randomSegment = (length: number): string => base64Url(crypto.getRandomValues(new Uint8Array(length)));

/** A compact JWE with this header and random IV, ciphertext and tag of the lengths `enc` A128GCM takes. */
const forged = (header: object, encryptedKey = ""): string =>
  [segmentOf(JSON.stringify(header)), encryptedKey, randomSegment(12), randomSegment(32), randomSegment(16)].join(".");

/** Flips the lowest bit of the first byte of one segment. */
const flipBit = (token: string, index: number): string => {
  const bytes = Buffer.from(token.split(".")[index] as string, "base64url");
  bytes[0] = (bytes[0] as number) ^ 1;
  return withSegment(token, index, base64Url(bytes));
};

describe("token shape", () => {
  it("should report malformed for a value that is not a string, without throwing", async () => {
    for (const value of [undefined, null, 1, {}, [], new Uint8Array(4)]) {
      // oxlint-disable-next-line no-await-in-loop -- each value is one small check
      expect(await decrypt(value)).toEqual(failure({ code: "malformed" }));
    }
  });

  it("should report malformed for four or six segments", async () => {
    const token = await encrypt({ plaintext: "x", key: kw, enc: "A128GCM" });

    expect(await decrypt(token.split(".").slice(0, 4).join("."))).toEqual(failure({ code: "malformed" }));
    expect(await decrypt(`${token}.`)).toEqual(failure({ code: "malformed" }));
    // A compact JWS is three segments.
    expect(await decrypt("e30.e30.")).toEqual(failure({ code: "malformed" }));
  });

  it("should report malformed for an empty IV or tag, and for padded or non-canonical base64url", async () => {
    const token = await encrypt({ plaintext: "x", key: kw, enc: "A128GCM" });

    expect(await decrypt(withSegment(token, 2, ""))).toEqual(failure({ code: "malformed", path: ["iv"] }));
    expect(await decrypt(withSegment(token, 4, ""))).toEqual(failure({ code: "malformed", path: ["tag"] }));
    expect(await decrypt(withSegment(token, 4, `${token.split(".")[4]}=`))).toEqual(
      failure({ code: "malformed", path: ["tag"] }),
    );
    expect(await decrypt(withSegment(token, 3, "a+b/"))).toEqual(failure({ code: "malformed", path: ["ciphertext"] }));
  });

  it("should report malformed for an IV or tag of the wrong length for enc", async () => {
    const token = await encrypt({ plaintext: "x", key: kw, enc: "A128GCM" });

    expect(await decrypt(withSegment(token, 2, randomSegment(16)))).toEqual(
      failure({ code: "malformed", path: ["iv"] }),
    );
    expect(await decrypt(withSegment(token, 4, randomSegment(15)))).toEqual(
      failure({ code: "malformed", path: ["tag"] }),
    );
  });

  it("should report malformed for an encrypted key that dir or ECDH-ES carries, or that A128KW lacks", async () => {
    const direct = await encrypt({ plaintext: "x", key: dirKey });
    const wrapped = await encrypt({ plaintext: "x", key: kw, enc: "A128GCM" });

    expect(await decrypt(withSegment(direct, 1, randomSegment(24)))).toEqual(
      failure({ code: "malformed", path: ["encrypted_key"] }),
    );
    expect(await decrypt(withSegment(wrapped, 1, ""))).toEqual(failure({ code: "malformed", path: ["encrypted_key"] }));
  });

  it("should reject a header naming alg twice", async () => {
    const header = segmentOf('{"alg":"A128KW","enc":"A128GCM","alg":"A128KW"}');

    const token = await encrypt({ plaintext: "x", key: kw, enc: "A128GCM" });
    expect(await decrypt(withSegment(token, 0, header))).toMatchObject({
      ok: false,
      error: { issues: [{ code: "duplicate_key" }] },
    });
  });
});

describe("refused algorithms and parameters", () => {
  it.each([
    ["RSA1_5", "A128CBC-HS256"],
    ["PBES2-HS256+A128KW", "A128GCM"],
    ["A128GCMKW", "A128GCM"],
    ["A192KW", "A128GCM"],
    ["none", "A128GCM"],
    ["HS256", "A128GCM"],
  ])("should report unsupported_alg for %s", async (alg, enc) => {
    expect(await decrypt(forged({ alg, enc }, randomSegment(24)))).toEqual(
      failure({ code: "unsupported_alg", path: ["header", "alg"] }),
    );
  });

  it.each(["A192GCM", "A192CBC-HS384", "A128CBC", "none"])("should report unsupported_enc for %s", async (enc) => {
    expect(await decrypt(forged({ alg: "A128KW", enc }, randomSegment(24)))).toEqual(
      failure({ code: "unsupported_enc", path: ["header", "enc"] }),
    );
  });

  it("should refuse zip and any crit before any cryptography", async () => {
    expect(await decrypt(forged({ alg: "A128KW", enc: "A128GCM", zip: "DEF" }, randomSegment(24)))).toEqual(
      failure({ code: "malformed", path: ["header", "zip"] }),
    );
    expect(await decrypt(forged({ alg: "A128KW", enc: "A128GCM", crit: ["exp"], exp: 1 }, randomSegment(24)))).toEqual(
      failure({ code: "unsupported_crit", path: ["header", "crit"] }),
    );
  });

  it("should take alg and enc from the protected header only, never from a __proto__ member", async () => {
    const header = segmentOf('{"__proto__":{"alg":"A128KW","enc":"A128GCM"}}');

    expect(await decrypt(withSegment(forged({}, randomSegment(24)), 0, header))).toEqual(
      failure({ code: "unsupported_alg", path: ["header", "alg"] }),
    );
  });
});

describe("oracle resistance", () => {
  it("should report one failure for a bad tag, a bad ciphertext, a bad IV and a changed header", async () => {
    const token = await encrypt({ plaintext: "a secret", key: rsa.publicKey, enc: "A256GCM" });
    const header = segmentOf(JSON.stringify({ alg: "RSA-OAEP-256", enc: "A256GCM", kid: "rsa", typ: "x" }));

    expect(await decrypt(flipBit(token, 4))).toEqual(DECRYPTION_FAILED);
    expect(await decrypt(flipBit(token, 3))).toEqual(DECRYPTION_FAILED);
    expect(await decrypt(flipBit(token, 2))).toEqual(DECRYPTION_FAILED);
    expect(await decrypt(withSegment(token, 0, header))).toEqual(DECRYPTION_FAILED);
  });

  it("should report the same failure for an RSA-OAEP encrypted key that does not decrypt", async () => {
    const token = await encrypt({ plaintext: "a secret", key: rsa.publicKey, enc: "A256GCM" });

    expect(await decrypt(flipBit(token, 1))).toEqual(DECRYPTION_FAILED);
    expect(await decrypt(withSegment(token, 1, randomSegment(256)))).toEqual(DECRYPTION_FAILED);
    expect(await decrypt(withSegment(token, 1, randomSegment(255)))).toEqual(DECRYPTION_FAILED);
  });

  it("should report the same failure for an AES key wrap that does not unwrap, or unwraps to the wrong length", async () => {
    const token = await encrypt({ plaintext: "a secret", key: kw, enc: "A128CBC-HS256" });

    expect(await decrypt(flipBit(token, 1))).toEqual(DECRYPTION_FAILED);
    expect(await decrypt(withSegment(token, 1, randomSegment(40)))).toEqual(DECRYPTION_FAILED);
    // A valid wrap of a 16-byte key, where A128CBC-HS256 needs 32: re-labelled from an A128GCM token.
    const gcm = await encrypt({ plaintext: "a secret", key: kw, enc: "A128GCM" });
    const relabelled = withSegment(
      withSegment(gcm, 0, segmentOf(JSON.stringify({ alg: "A128KW", enc: "A128CBC-HS256", kid: "kw" }))),
      2,
      randomSegment(16),
    );
    expect(await decrypt(relabelled)).toEqual(DECRYPTION_FAILED);
  });

  it("should report the same failure for CBC ciphertext that is not whole blocks", async () => {
    const token = await encrypt({ plaintext: "a secret", key: dirKey });

    expect(await decrypt(withSegment(token, 3, randomSegment(15)))).toEqual(DECRYPTION_FAILED);
    expect(await decrypt(withSegment(token, 3, ""))).toEqual(DECRYPTION_FAILED);
  });

  it("should report the same failure for a header swapped in from another token for the same key", async () => {
    const first = await encrypt({ plaintext: "one", key: kw, enc: "A128GCM", header: { typ: "a" } });
    const second = await encrypt({ plaintext: "two", key: kw, enc: "A128GCM", header: { typ: "b" } });

    expect(await decrypt(withSegment(first, 0, second.split(".")[0] as string))).toEqual(DECRYPTION_FAILED);
  });
});

describe("ephemeral public keys", () => {
  const coordinate = (length: number, fill = 0): string => base64Url(new Uint8Array(length).fill(fill));

  it("should report malformed epk for a missing, non-object or incomplete epk", async () => {
    expect(await decrypt(forged({ alg: "ECDH-ES", enc: "A128GCM", kid: "p256" }))).toEqual(MALFORMED_EPK);
    expect(await decrypt(forged({ alg: "ECDH-ES", enc: "A128GCM", kid: "p256", epk: "key" }))).toEqual(MALFORMED_EPK);
    const { x } = p256Epk();
    expect(
      await decrypt(forged({ alg: "ECDH-ES", enc: "A128GCM", kid: "p256", epk: { kty: "EC", crv: "P-256", x } })),
    ).toEqual(MALFORMED_EPK);
  });

  it("should report malformed epk for a point on another curve than the key's", async () => {
    const other = await generateJweKeyPair({ alg: "ECDH-ES", crv: "P-384", extractable: true });
    const token = await encrypt({ plaintext: "x", key: other.publicKey, enc: "A128GCM", header: { kid: "p256" } });

    expect(await decrypt(token)).toEqual(MALFORMED_EPK);
  });

  it("should report malformed epk for a point not on the curve", async () => {
    const { x } = p256Epk();
    const epk = { kty: "EC", crv: "P-256", x, y: x };

    expect(await decrypt(forged({ alg: "ECDH-ES", enc: "A128GCM", kid: "p256", epk }))).toEqual(MALFORMED_EPK);
  });

  it("should report malformed epk for coordinates of the wrong length", async () => {
    const epk = { kty: "EC", crv: "P-256", x: coordinate(31, 1), y: coordinate(33, 1) };

    expect(await decrypt(forged({ alg: "ECDH-ES", enc: "A128GCM", kid: "p256", epk }))).toEqual(MALFORMED_EPK);
  });

  it("should report malformed epk for an epk carrying a private key or other members", async () => {
    const epk = { ...p256Epk(), d: coordinate(32, 1) };

    expect(await decrypt(forged({ alg: "ECDH-ES", enc: "A128GCM", kid: "p256", epk }))).toEqual(MALFORMED_EPK);
  });

  it.each([
    ["zero", 0],
    ["one", 1],
  ])("should report malformed epk for the low-order X25519 point %s", async (_name, value) => {
    const bytes = new Uint8Array(32);
    bytes[0] = value;
    const epk = { kty: "OKP", crv: "X25519", x: base64Url(bytes) };

    expect(
      await decrypt(forged({ alg: "ECDH-ES+A128KW", enc: "A128GCM", kid: "x25519", epk }, randomSegment(24))),
    ).toEqual(MALFORMED_EPK);
  });

  it("should report malformed epk for an X25519 epk with a y member", async () => {
    const epk = { kty: "OKP", crv: "X25519", x: coordinate(32, 9), y: coordinate(32, 9) };

    expect(
      await decrypt(forged({ alg: "ECDH-ES+A128KW", enc: "A128GCM", kid: "x25519", epk }, randomSegment(24))),
    ).toEqual(MALFORMED_EPK);
  });

  /** A well-formed P-256 point: the base point G. */
  function p256Epk(): { kty: string; crv: string; x: string; y: string } {
    return {
      kty: "EC",
      crv: "P-256",
      x: Buffer.from("6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296", "hex").toString("base64url"),
      y: Buffer.from("4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5", "hex").toString("base64url"),
    };
  }
});

describe("key selection", () => {
  it("should report alg_mismatch for a kid naming a key of another algorithm", async () => {
    const token = await encrypt({ plaintext: "x", key: kw, enc: "A128GCM", header: { kid: "rsa" } });

    expect(await decrypt(token)).toEqual(failure({ code: "alg_mismatch", path: ["header", "alg"] }));
  });

  it("should report alg_mismatch for a dir token whose enc is not the key's", async () => {
    const other = await generateJweSecretKey({ alg: "dir", enc: "A256GCM", kid: "dir" });
    const token = await encrypt({ plaintext: "x", key: other });

    expect(await decrypt(token)).toEqual(failure({ code: "alg_mismatch", path: ["header", "enc"] }));
  });

  it("should refuse an enc the decrypter does not accept, before selecting a key", async () => {
    const strict = createDecrypter({ keys: createJweKeySet([kw]), enc: ["A256GCM"] });
    const token = await encrypt({ plaintext: "x", key: kw, enc: "A128GCM" });

    expect(await strict(token)).toEqual(failure({ code: "unsupported_enc", path: ["header", "enc"] }));
  });

  it("should never try keys by trial: a token without kid against two keys of its alg is ambiguous", async () => {
    const second = await generateJweSecretKey({ alg: "A128KW", kid: "kw2" });
    const both = createDecrypter({ keys: createJweKeySet([kw, second]) });
    const token = await encrypt({ plaintext: "x", key: kw, enc: "A128GCM", header: { kid: "" } });
    const withoutKid = withSegment(token, 0, segmentOf(JSON.stringify({ alg: "A128KW", enc: "A128GCM" })));

    expect(await both(withoutKid)).toEqual(failure({ code: "ambiguous_key" }));
  });
});

describe("oversized input", () => {
  it("should reject a 16 MiB token by its length alone", async () => {
    expect(await decrypt("a".repeat(16 * 1024 * 1024))).toEqual(
      failure({ code: "too_large", params: { limit: "length", maximum: 16_384 } }),
    );
  });

  it("should reject a token one character over maxLength", async () => {
    const token = await encrypt({ plaintext: "x", key: kw, enc: "A128GCM" });
    const tight = createDecrypter({ keys: createJweKeySet([kw]), maxLength: token.length - 1 });

    expect(await tight(token)).toEqual(
      failure({ code: "too_large", params: { limit: "length", maximum: token.length - 1 } }),
    );
  });
});

describe("JWS and JWE key confusion", () => {
  it("should refuse a JWS key wherever a JWE key goes, and the reverse", async () => {
    const jwsPair = await generateKeyPair({ alg: "ES256" });
    const hmac = await generateSecretKey({ alg: "HS256" });

    expect(() => createJweKeySet([jwsPair.privateKey as never])).toThrow(TypeError);
    expect(() => createJweKeySet([hmac as never])).toThrow(TypeError);
    await expect(encrypt({ plaintext: "x", key: jwsPair.publicKey as never, enc: "A128GCM" })).rejects.toThrow(
      TypeError,
    );
    await expect(encrypt({ plaintext: "x", key: hmac as never, enc: "A128GCM" })).rejects.toThrow(TypeError);

    expect(() => createKeySet([p256.publicKey as never])).toThrow(TypeError);
    await expect(sign({ payload: {}, key: kw as never })).rejects.toThrow(TypeError);
    await expect(sign({ payload: {}, key: p256.privateKey as never })).rejects.toThrow(TypeError);
    await expect(exportSecretJwk(kw as never)).rejects.toThrow(TypeError);
  });

  it("should refuse a private key for encryption and a public key in a decryption key set", async () => {
    await expect(encrypt({ plaintext: "x", key: p256.privateKey as never, enc: "A128GCM" })).rejects.toThrow(TypeError);
    expect(() => createJweKeySet([p256.publicKey as never])).toThrow(TypeError);
  });

  it("should never yield a signing key from an encryption JWKS, nor an encryption key from a signing one", async () => {
    const signing = await generateKeyPair({ alg: "ES256", extractable: true });
    const { exportPublicJwk } = await import("../../src");
    const sigJwk = { ...(await exportPublicJwk(signing.publicKey)), use: "sig" };
    const encJwk = { ...sigJwk, use: "enc", alg: "ECDH-ES" };

    const enc = await importKeySet({ keys: [sigJwk, encJwk] }, { use: "enc" });
    const sig = await importKeySet({ keys: [sigJwk, encJwk] });

    expect(enc.ok && enc.value.keys.map((key) => key.alg)).toEqual(["ECDH-ES"]);
    expect(sig.ok && sig.value.keys.map((key) => key.alg)).toEqual(["ES256"]);
  });

  it("should give the same thumbprint for a JWE key pair's halves", async () => {
    const pair = await generateJweKeyPair({ alg: "ECDH-ES", crv: "X25519" });

    expect(await jwkThumbprint(pair.privateKey)).toBe(await jwkThumbprint(pair.publicKey));
  });
});

describe("results", () => {
  it("should deep-freeze the header and leave the plaintext to the caller", async () => {
    const token = await encrypt({ plaintext: "hello", key: p256.publicKey, enc: "A128GCM" });
    const result = await decrypt(token);

    const value = result.ok ? result.value : undefined;
    const plaintext = value?.plaintext ?? new Uint8Array(1).fill(1);
    plaintext[0] = 0;

    expect(result.ok).toBe(true);
    expect([Object.isFrozen(result), Object.isFrozen(value), Object.isFrozen(value?.header)]).toEqual([
      true,
      true,
      true,
    ]);
    expect(Object.isFrozen(value?.header.epk)).toBe(true);
    expect(plaintext[0]).toBe(0);
  });

  it("should deep-freeze failures", async () => {
    const result = await decrypt("a.b.c.d.e");

    expect(Object.isFrozen(result)).toBe(true);
    expect(result.ok || Object.isFrozen(result.error.issues)).toBe(true);
  });
});
