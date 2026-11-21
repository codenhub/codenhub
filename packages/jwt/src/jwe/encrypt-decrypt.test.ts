import * as jose from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import { createKeySet, createVerifier, generateKeyPair, sign, type KeyPair } from "../index";
import { createDecrypter, createJweKeySet, createNestedVerifier, decodeJsonObject } from "./decrypt";
import { encrypt, encryptJwt } from "./encrypt";
import { exportJwePrivateJwk, generateJweKeyPair, generateJweSecretKey } from "./keys";
import type { JweKeyPair } from "./keys";
import type { JweSecretKey } from "./types";

const headerOf = (token: string): unknown =>
  JSON.parse(Buffer.from(token.split(".")[0] as string, "base64url").toString("utf8"));
const rawHeaderOf = (token: string): string => Buffer.from(token.split(".")[0] as string, "base64url").toString("utf8");

const exp = Math.floor(Date.now() / 1000) + 600;

/** The value of a success; a failure fails the test with its issues. */
const valueOf = <T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!result.ok) {
    throw new Error(`expected success, got ${JSON.stringify(result.error)}`);
  }
  return result.value;
};

let recipient: JweKeyPair;
let kw: JweSecretKey;
let signer: KeyPair;

beforeAll(async () => {
  [recipient, kw, signer] = await Promise.all([
    generateJweKeyPair({ alg: "ECDH-ES+A256KW", crv: "P-256", kid: "enc-1", extractable: true }),
    generateJweSecretKey({ alg: "A256KW", kid: "kw-1" }),
    generateKeyPair({ alg: "ES256", kid: "sig-1" }),
  ]);
});

describe("encrypt", () => {
  it("should write alg, enc, kid, typ, cty and epk first, then the caller's members", async () => {
    const token = await encrypt({
      plaintext: new Uint8Array([1, 2, 3]),
      key: recipient.publicKey,
      enc: "A128GCM",
      header: { "1": "number-like", custom: true, cty: "text/plain", typ: "x+jwe" },
    });

    expect(rawHeaderOf(token)).toMatch(
      /^\{"alg":"ECDH-ES\+A256KW","enc":"A128GCM","kid":"enc-1","typ":"x\+jwe","cty":"text\/plain","epk":\{[^}]+\},"1":"number-like","custom":true\}$/,
    );
    expect(headerOf(token)).toMatchObject({ epk: { kty: "EC", crv: "P-256" } });
    expect((headerOf(token) as { epk: object }).epk).not.toHaveProperty("d");
  });

  it("should let header.kid replace the key's kid, and write no kid for a key without one", async () => {
    const anonymous = await generateJweSecretKey({ alg: "A128KW" });

    expect(headerOf(await encrypt({ plaintext: "", key: kw, enc: "A256GCM", header: { kid: "other" } }))).toMatchObject(
      {
        kid: "other",
      },
    );
    expect(headerOf(await encrypt({ plaintext: "", key: anonymous, enc: "A256GCM" }))).toEqual({
      alg: "A128KW",
      enc: "A256GCM",
    });
  });

  it("should draw a fresh content key and IV for every token", async () => {
    const [one, two] = await Promise.all([
      encrypt({ plaintext: "same", key: kw, enc: "A256GCM" }),
      encrypt({ plaintext: "same", key: kw, enc: "A256GCM" }),
    ]);

    expect(one.split(".")[1]).not.toBe(two.split(".")[1]);
    expect(one.split(".")[2]).not.toBe(two.split(".")[2]);
  });

  it.each(["crit", "zip", "epk", "apu", "apv", "iv", "tag", "p2s", "p2c", "b64", "jwk", "jku", "x5u", "x5c"])(
    "should refuse header.%s",
    async (member) => {
      await expect(encrypt({ plaintext: "", key: kw, enc: "A256GCM", header: { [member]: "x" } })).rejects.toThrow(
        `encrypt: input.header.${member} is not supported.`,
      );
    },
  );

  it("should refuse a header alg or enc that differs, and a kid, typ or cty that is not text", async () => {
    await expect(encrypt({ plaintext: "", key: kw, enc: "A256GCM", header: { alg: "A128KW" } })).rejects.toThrow(
      TypeError,
    );
    await expect(encrypt({ plaintext: "", key: kw, enc: "A256GCM", header: { enc: "A128GCM" } })).rejects.toThrow(
      TypeError,
    );
    await expect(encrypt({ plaintext: "", key: kw, enc: "A256GCM", header: { kid: 1 } as never })).rejects.toThrow(
      TypeError,
    );
    await expect(
      encrypt({ plaintext: "", key: kw, enc: "A256GCM", header: { alg: "A256KW", enc: "A256GCM" } }),
    ).resolves.toMatch(/^ey/);
  });

  it("should require enc except for dir, where it may only repeat the key's", async () => {
    const dir = await generateJweSecretKey({ alg: "dir", enc: "A256GCM" });

    await expect(encrypt({ plaintext: "", key: kw } as never)).rejects.toThrow(TypeError);
    await expect(encrypt({ plaintext: "", key: kw, enc: "A192GCM" as never })).rejects.toThrow(TypeError);
    await expect(encrypt({ plaintext: "", key: dir, enc: "A128GCM" })).rejects.toThrow(TypeError);
    expect(headerOf(await encrypt({ plaintext: "", key: dir }))).toEqual({ alg: "dir", enc: "A256GCM" });
  });

  it("should refuse a plaintext that is neither bytes nor text", async () => {
    await expect(encrypt({ plaintext: [1, 2] as never, key: kw, enc: "A256GCM" })).rejects.toThrow(TypeError);
    await expect(encrypt({ plaintext: new ArrayBuffer(2) as never, key: kw, enc: "A256GCM" })).rejects.toThrow(
      TypeError,
    );
  });

  it("should refuse a header member with a getter, which could show the checks one value and the token another", async () => {
    let reads = 0;
    const header = {
      get kid() {
        reads += 1;
        return reads === 1 ? "checked" : 42;
      },
    };
    await expect(encrypt({ plaintext: "", key: kw, enc: "A256GCM", header: header as never })).rejects.toThrow(
      "encrypt: input.header must not hold accessor properties.",
    );
    expect(reads).toBe(0);
  });

  it("should copy the plaintext before encrypting", async () => {
    const plaintext = new Uint8Array([1, 2, 3]);
    const pending = encrypt({ plaintext, key: kw, enc: "A256GCM" });
    plaintext.fill(9);
    const result = await createDecrypter({ keys: createJweKeySet([kw]) })(await pending);

    expect(result.ok && [...result.value.plaintext]).toEqual([1, 2, 3]);
  });
});

describe("createDecrypter", () => {
  it("should return the header, the plaintext and the key", async () => {
    const token = await encrypt({ plaintext: "hello", key: recipient.publicKey, enc: "A256CBC-HS512" });
    const result = await createDecrypter({ keys: createJweKeySet([recipient.privateKey]) })(token);

    const decrypted = valueOf(result);

    expect(decrypted.key).toBe(recipient.privateKey);
    expect(decrypted.header).toMatchObject({ alg: "ECDH-ES+A256KW", enc: "A256CBC-HS512", kid: "enc-1" });
    expect(new TextDecoder().decode(decrypted.plaintext)).toBe("hello");
  });

  it("should use apu and apv from the header in the key derivation", async () => {
    const jwk = await exportJwePrivateJwk(recipient.privateKey);
    const publicJwk = Object.fromEntries(Object.entries(jwk).filter(([name]) => name !== "d"));
    const key = await jose.importJWK(publicJwk as jose.JWK, "ECDH-ES+A256KW");
    const token = await new jose.CompactEncrypt(new TextEncoder().encode("agreed"))
      .setProtectedHeader({ alg: "ECDH-ES+A256KW", enc: "A128GCM", kid: "enc-1" })
      .setKeyManagementParameters({ apu: new TextEncoder().encode("Alice"), apv: new TextEncoder().encode("Bob") })
      .encrypt(key);
    const result = await createDecrypter({ keys: createJweKeySet([recipient.privateKey]) })(token);

    expect(result.ok && result.value.header).toMatchObject({ apu: "QWxpY2U", apv: "Qm9i" });
  });

  it("should report key_fetch_failed for a key set that throws or returns garbage", async () => {
    const token = await encrypt({ plaintext: "", key: kw, enc: "A256GCM" });
    const throwing = createDecrypter({
      keys: {
        select: () => {
          throw new Error("boom");
        },
      },
    });
    const garbage = createDecrypter({ keys: { select: async () => ({ nonsense: true }) } as never });

    const expected = {
      ok: false,
      error: { issues: [{ code: "key_fetch_failed", params: { reason: "key_set_error" } }] },
    };
    expect(await throwing(token)).toEqual(expected);
    expect(await garbage(token)).toEqual(expected);
  });

  it.each([
    ["an object shaped like a key", { kind: "jwe-secret", alg: "A256KW", kid: undefined }],
    ["a public encryption key", "public"],
    ["a signing key", "signing"],
  ])("should report key_set_error, never throw, for a key set that selects %s", async (_name, value) => {
    const signing = await generateKeyPair({ alg: "ES256" });
    const selected = value === "public" ? recipient.publicKey : value === "signing" ? signing.privateKey : value;
    const token = await encrypt({ plaintext: "", key: kw, enc: "A256GCM" });
    const decrypt = createDecrypter({ keys: { select: async () => ({ ok: true, value: selected }) } as never });

    expect(await decrypt(token)).toEqual({
      ok: false,
      error: { issues: [{ code: "key_fetch_failed", params: { reason: "key_set_error" } }] },
    });
  });

  it.each([
    ["a path that is a string", { code: "unknown_kid", path: "kid" }],
    ["a path that is a number", { code: "unknown_kid", path: 0 }],
    ["a path holding an object", { code: "unknown_kid", path: [{}] }],
    ["a path holding NaN", { code: "unknown_kid", path: [Number.NaN] }],
    [
      "a path behind a getter",
      Object.defineProperty({ code: "unknown_kid" }, "path", { enumerable: true, get: () => ["kid"] }),
    ],
  ])("should report key_set_error for a key set failure whose issue has %s", async (_name, issue) => {
    const token = await encrypt({ plaintext: "", key: kw, enc: "A256GCM" });
    const decrypt = createDecrypter({
      keys: { select: async () => ({ ok: false, error: { issues: [issue] } }) } as never,
    });

    expect(await decrypt(token)).toEqual({
      ok: false,
      error: { issues: [{ code: "key_fetch_failed", params: { reason: "key_set_error" } }] },
    });
  });

  it("should pass on a copy of a key set issue whose path is an array of strings and numbers", async () => {
    const token = await encrypt({ plaintext: "", key: kw, enc: "A256GCM" });
    const path = ["tenant", 0];
    const decrypt = createDecrypter({
      keys: { select: async () => ({ ok: false, error: { issues: [{ code: "unknown_kid", path }] } }) } as never,
    });

    const result = await decrypt(token);
    path.push("later");
    expect(result).toEqual({ ok: false, error: { issues: [{ code: "unknown_kid", path: ["tenant", 0] }] } });
  });

  it("should refuse options that are not valid", () => {
    const keys = createJweKeySet([kw]);

    expect(() => createDecrypter({ keys, enc: [] })).toThrow(TypeError);
    expect(() => createDecrypter({ keys, enc: ["A192GCM" as never] })).toThrow(TypeError);
    expect(() => createDecrypter({ keys, maxLength: 0 })).toThrow(TypeError);
    expect(() => createDecrypter({ keys: {} as never })).toThrow(TypeError);
  });
});

describe("AES-GCM key wrap", () => {
  const withHeader = (token: string, change: (header: Record<string, unknown>) => void): string => {
    const header = headerOf(token) as Record<string, unknown>;
    change(header);
    return [Buffer.from(JSON.stringify(header)).toString("base64url"), ...token.split(".").slice(1)].join(".");
  };
  const decryptWith = (key: JweSecretKey) => createDecrypter({ keys: createJweKeySet([key]) });

  it("should write a 96-bit iv and a 128-bit tag to the protected header, and decrypt", async () => {
    const key = await generateJweSecretKey({ alg: "A128GCMKW", kid: "gcm" });
    const token = await encrypt({ plaintext: "wrapped", key, enc: "A256CBC-HS512" });
    const header = headerOf(token) as { iv: string; tag: string };

    expect(rawHeaderOf(token)).toMatch(
      /^\{"alg":"A128GCMKW","enc":"A256CBC-HS512","kid":"gcm","iv":"[^"]+","tag":"[^"]+"\}$/,
    );
    expect(Buffer.from(header.iv, "base64url")).toHaveLength(12);
    expect(Buffer.from(header.tag, "base64url")).toHaveLength(16);
    expect(Buffer.from(token.split(".")[1] as string, "base64url")).toHaveLength(64);
    const result = await decryptWith(key)(token);
    expect(result.ok && new TextDecoder().decode(result.value.plaintext)).toBe("wrapped");
  });

  it.each([
    ["a missing iv", (header: Record<string, unknown>): void => void delete header.iv, "iv"],
    ["a missing tag", (header: Record<string, unknown>): void => void delete header.tag, "tag"],
    ["an iv that is not text", (header: Record<string, unknown>): void => void (header.iv = 12), "iv"],
    ["an iv of 64 bits", (header: Record<string, unknown>): void => void (header.iv = "AAAAAAAAAAA"), "iv"],
    ["a tag of 96 bits", (header: Record<string, unknown>): void => void (header.tag = "AAAAAAAAAAAAAAAA"), "tag"],
    [
      "a tag that is not canonical base64url",
      (header: Record<string, unknown>): void => void (header.tag = "AAAAAAAAAAAAAAAAAAAAAB"),
      "tag",
    ],
  ] as const)("should report malformed at the header for %s", async (_name, change, member) => {
    const key = await generateJweSecretKey({ alg: "A256GCMKW" });
    const token = withHeader(await encrypt({ plaintext: "x", key, enc: "A128GCM" }), change);

    expect(await decryptWith(key)(token)).toEqual({
      ok: false,
      error: { issues: [{ code: "malformed", path: ["header", member] }] },
    });
  });

  it("should report decryption_failed for a wrong key, a tampered tag or encrypted key, and a key of the wrong length", async () => {
    const [key, other] = await Promise.all([
      generateJweSecretKey({ alg: "A256GCMKW" }),
      generateJweSecretKey({ alg: "A256GCMKW" }),
    ]);
    const token = await encrypt({ plaintext: "x", key, enc: "A128GCM" });
    const [header, encryptedKey, ...rest] = token.split(".") as [string, string, ...string[]];
    const flipped = Buffer.from(encryptedKey, "base64url");
    flipped[0] = (flipped[0] as number) ^ 1;
    const tampered = [header, flipped.toString("base64url"), ...rest].join(".");
    const longer = [header, Buffer.alloc(32).toString("base64url"), ...rest].join(".");
    const otherTag = withHeader(token, (value) => (value.tag = Buffer.alloc(16).toString("base64url")));

    const failed = { ok: false, error: { issues: [{ code: "decryption_failed" }] } };
    expect(await decryptWith(other)(token)).toEqual(failed);
    expect(await decryptWith(key)(tampered)).toEqual(failed);
    expect(await decryptWith(key)(longer)).toEqual(failed);
    expect(await decryptWith(key)(otherTag)).toEqual(failed);
  });

  it("should refuse iv and tag in the caller's header", async () => {
    const key = await generateJweSecretKey({ alg: "A128GCMKW" });

    await expect(encrypt({ plaintext: "", key, enc: "A128GCM", header: { iv: "AAAAAAAAAAAAAAAA" } })).rejects.toThrow(
      TypeError,
    );
  });
});

describe("RSA-OAEP-384 and RSA-OAEP-512", () => {
  it.each(["RSA-OAEP-384", "RSA-OAEP-512"] as const)("should encrypt and decrypt with %s", async (alg) => {
    const pair = await generateJweKeyPair({ alg });
    const token = await encrypt({ plaintext: "oaep", key: pair.publicKey, enc: "A256GCM" });
    const result = await createDecrypter({ keys: createJweKeySet([pair.privateKey]) })(token);

    expect(headerOf(token)).toEqual({ alg, enc: "A256GCM" });
    expect(Buffer.from(token.split(".")[1] as string, "base64url")).toHaveLength(256);
    expect(result.ok && new TextDecoder().decode(result.value.plaintext)).toBe("oaep");
  });
});

describe("createJweKeySet", () => {
  it("should refuse public keys, foreign objects and a repeated kid and alg", () => {
    expect(() => createJweKeySet([recipient.publicKey as never])).toThrow(TypeError);
    expect(() => createJweKeySet([{ kind: "jwe-secret", alg: "A256KW" } as never])).toThrow(TypeError);
    expect(() => createJweKeySet([kw, kw])).toThrow(TypeError);
  });

  it("should select by kid and alg", async () => {
    const set = createJweKeySet([kw, recipient.privateKey]);

    expect(await set.select({ alg: "A256KW", enc: "A256GCM", kid: "kw-1" })).toEqual({ ok: true, value: kw });
    expect(await set.select({ alg: "A256KW", enc: "A256GCM", kid: "missing" })).toMatchObject({
      ok: false,
      error: { issues: [{ code: "unknown_kid" }] },
    });
    expect(Object.isFrozen(set) && Object.isFrozen(set.keys)).toBe(true);
  });
});

describe("decodeJsonObject", () => {
  it("should parse a JSON object strictly, and freeze it", () => {
    const result = decodeJsonObject(new TextEncoder().encode('{"a":{"b":1}}'));

    expect(result).toEqual({ ok: true, value: { a: { b: 1 } } });
    expect(result.ok && Object.isFrozen(result.value.a)).toBe(true);
  });

  it.each([
    ["an array", "[1]"],
    ["a duplicate member", '{"a":1,"a":2}'],
    ["invalid JSON", "{"],
    ["a string", '"x"'],
  ])("should fail for %s", (_, json) => {
    expect(decodeJsonObject(new TextEncoder().encode(json)).ok).toBe(false);
  });

  it("should fail for bytes that are not UTF-8", () => {
    expect(decodeJsonObject(new Uint8Array([0x7b, 0xff, 0x7d]))).toEqual({
      ok: false,
      error: { issues: [{ code: "malformed", path: ["plaintext"] }] },
    });
  });
});

describe("encryptJwt and createNestedVerifier", () => {
  const nested = () =>
    createNestedVerifier({
      decrypt: createDecrypter({ keys: createJweKeySet([recipient.privateKey]) }),
      verify: createVerifier({ keys: createKeySet([signer.publicKey]), audience: "api" }),
    });

  it("should sign, then encrypt with cty JWT, and verify both layers", async () => {
    const token = await encryptJwt({
      sign: { payload: { sub: "user-1", aud: "api", exp }, key: signer.privateKey },
      key: recipient.publicKey,
      enc: "A256GCM",
    });
    const result = await nested()(token);

    expect(headerOf(token)).toMatchObject({ cty: "JWT", kid: "enc-1" });
    const verified = valueOf(result);
    expect(verified.payload).toMatchObject({ sub: "user-1" });
    expect(verified.header).toMatchObject({ alg: "ES256", kid: "sig-1" });
    expect(verified.encryption.header).toMatchObject({ alg: "ECDH-ES+A256KW", cty: "JWT" });
    expect(verified.encryption.key).toBe(recipient.privateKey);
  });

  it("should accept cty in any case and with the application/ prefix, and a missing cty", async () => {
    const jws = await sign({ payload: { aud: "api", exp }, key: signer.privateKey });

    const outcomes = await Promise.all(
      ["jwt", "application/jwt", "APPLICATION/JWT", undefined].map(async (cty) => {
        const header = cty === undefined ? {} : { cty };
        const token = await encrypt({ plaintext: jws, key: recipient.publicKey, enc: "A128GCM", header });
        return `${String(cty)}: ${(await nested()(token)).ok}`;
      }),
    );

    expect(outcomes).toEqual(["jwt: true", "application/jwt: true", "APPLICATION/JWT: true", "undefined: true"]);
  });

  it("should report wrong_type for another cty, and the inner verifier's issues for a bad JWT", async () => {
    const jws = await sign({ payload: { aud: "other", exp }, key: signer.privateKey });
    const wrongCty = await encrypt({
      plaintext: jws,
      key: recipient.publicKey,
      enc: "A128GCM",
      header: { cty: "json" },
    });
    const wrongAudience = await encrypt({
      plaintext: jws,
      key: recipient.publicKey,
      enc: "A128GCM",
      header: { cty: "JWT" },
    });

    expect(await nested()(wrongCty)).toEqual({
      ok: false,
      error: { issues: [{ code: "wrong_type", path: ["header", "cty"] }] },
    });
    expect(await nested()(wrongAudience)).toEqual({
      ok: false,
      error: { issues: [{ code: "wrong_audience", path: ["plaintext", "payload", "aud"] }] },
    });
  });

  it("should put every inner issue under plaintext, and leave the outer JWE's issues as they are", async () => {
    const unknownKid = await encryptJwt({
      sign: { payload: { aud: "api", exp }, key: signer.privateKey, header: { kid: "missing" } },
      key: recipient.publicKey,
      enc: "A128GCM",
    });
    const notJws = await encrypt({ plaintext: "not a token", key: recipient.publicKey, enc: "A128GCM" });
    const custom = createNestedVerifier({
      decrypt: createDecrypter({ keys: createJweKeySet([recipient.privateKey]) }),
      verify: async () => ({ ok: false, error: { issues: [{ code: "custom" }, { code: "other", path: ["x"] }] } }),
    } as never);
    const outer = await encrypt({ plaintext: "x", key: kw, enc: "A128GCM" });

    expect(await nested()(unknownKid)).toEqual({
      ok: false,
      error: { issues: [{ code: "unknown_kid", path: ["plaintext", "header", "kid"] }] },
    });
    expect(await nested()(notJws)).toEqual({
      ok: false,
      error: { issues: [{ code: "malformed", path: ["plaintext"] }] },
    });
    expect(await custom(notJws)).toEqual({
      ok: false,
      error: {
        issues: [
          { code: "custom", path: ["plaintext"] },
          { code: "other", path: ["plaintext", "x"] },
        ],
      },
    });
    expect(await nested()(outer)).toEqual({
      ok: false,
      error: { issues: [{ code: "unknown_kid", path: ["header", "kid"] }] },
    });
  });

  it("should report malformed plaintext for bytes that are not UTF-8", async () => {
    const token = await encrypt({ plaintext: new Uint8Array([0xff, 0xfe]), key: recipient.publicKey, enc: "A128GCM" });

    expect(await nested()(token)).toEqual({
      ok: false,
      error: { issues: [{ code: "malformed", path: ["plaintext"] }] },
    });
  });

  it("should refuse a cty other than JWT, and a JWS key, before signing", async () => {
    const input = { sign: { payload: {}, key: signer.privateKey }, key: recipient.publicKey, enc: "A128GCM" } as const;

    await expect(encryptJwt({ ...input, header: { cty: "json" } })).rejects.toThrow(TypeError);
    await expect(encryptJwt({ ...input, key: signer.publicKey as never })).rejects.toThrow(TypeError);
  });
});
