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

  it("should refuse options that are not valid", () => {
    const keys = createJweKeySet([kw]);

    expect(() => createDecrypter({ keys, enc: [] })).toThrow(TypeError);
    expect(() => createDecrypter({ keys, enc: ["A192GCM" as never] })).toThrow(TypeError);
    expect(() => createDecrypter({ keys, maxLength: 0 })).toThrow(TypeError);
    expect(() => createDecrypter({ keys: {} as never })).toThrow(TypeError);
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
      error: { issues: [{ code: "wrong_audience", path: ["payload", "aud"] }] },
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
