import { describe, expect, it } from "vitest";

import {
  createDecrypter,
  createJweKeySet,
  importJwePrivateKey,
  importJweSecretKey,
  type ContentEncryptionAlgorithm,
  type AsymmetricKeyManagementAlgorithm,
  type JweDecryptionKey,
  type JwtResult,
} from "../../src";
import {
  RFC7516_A1_JWK,
  RFC7516_A1_TOKEN,
  RFC7516_A2_TOKEN,
  RFC7516_A3_JWK,
  RFC7516_A3_TOKEN,
  RFC7520_5_1_TOKEN,
  RFC7520_5_2_JWK,
  RFC7520_5_2_TOKEN,
  RFC7520_5_3_TOKEN,
  RFC7520_5_4_JWK,
  RFC7520_5_4_TOKEN,
  RFC7520_5_5_JWK,
  RFC7520_5_5_TOKEN,
  RFC7520_5_6_JWK,
  RFC7520_5_6_TOKEN,
  RFC7520_5_8_JWK,
  RFC7520_5_8_TOKEN,
  RFC7520_5_9_TOKEN,
  RFC7520_PLAINTEXT,
} from "./fixtures/jwe-vectors";

const text = (bytes: Uint8Array): string => new TextDecoder("utf-8", { fatal: true }).decode(bytes);
const unwrap = <T>(result: JwtResult<T>): T => {
  if (!result.ok) {
    throw new Error(`expected success, got ${JSON.stringify(result.error.issues)}`);
  }
  return result.value;
};

async function decryptWith(key: JweDecryptionKey, token: string, enc?: readonly ContentEncryptionAlgorithm[]) {
  return createDecrypter({ keys: createJweKeySet([key]), enc })(token);
}

const privateKey = async (jwk: object, alg: AsymmetricKeyManagementAlgorithm) =>
  unwrap(await importJwePrivateKey({ ...jwk, use: "enc" }, { alg }));

describe("RFC 7516 Appendix A", () => {
  it("should decrypt A.1, RSA-OAEP with A256GCM", async () => {
    const result = unwrap(await decryptWith(await privateKey(RFC7516_A1_JWK, "RSA-OAEP"), RFC7516_A1_TOKEN));

    expect(result.header).toEqual({ alg: "RSA-OAEP", enc: "A256GCM" });
    expect(text(result.plaintext)).toBe("The true sign of intelligence is not knowledge but imagination.");
  });

  it("should refuse A.2, RSA1_5, before touching a key", async () => {
    const key = await privateKey(RFC7516_A1_JWK, "RSA-OAEP");

    expect(await decryptWith(key, RFC7516_A2_TOKEN)).toEqual({
      ok: false,
      error: { issues: [{ code: "unsupported_alg", path: ["header", "alg"] }] },
    });
  });

  it("should decrypt A.3, A128KW with A128CBC-HS256", async () => {
    const key = unwrap(await importJweSecretKey(RFC7516_A3_JWK, { alg: "A128KW" }));
    const result = unwrap(await decryptWith(key, RFC7516_A3_TOKEN));

    expect(result.header).toEqual({ alg: "A128KW", enc: "A128CBC-HS256" });
    expect(text(result.plaintext)).toBe("Live long and prosper.");
  });
});

describe("RFC 7520 section 5", () => {
  it("should decrypt 5.2, RSA-OAEP with A256GCM and a 4096-bit key", async () => {
    const result = unwrap(await decryptWith(await privateKey(RFC7520_5_2_JWK, "RSA-OAEP"), RFC7520_5_2_TOKEN));

    expect(result.header).toMatchObject({ alg: "RSA-OAEP", enc: "A256GCM", kid: RFC7520_5_2_JWK.kid });
    expect(text(result.plaintext)).toBe(RFC7520_PLAINTEXT);
  });

  it("should decrypt 5.4, ECDH-ES+A128KW with A128GCM on P-384", async () => {
    const result = unwrap(await decryptWith(await privateKey(RFC7520_5_4_JWK, "ECDH-ES+A128KW"), RFC7520_5_4_TOKEN));

    expect(result.header).toMatchObject({ alg: "ECDH-ES+A128KW", enc: "A128GCM", epk: { crv: "P-384" } });
    expect(text(result.plaintext)).toBe(RFC7520_PLAINTEXT);
  });

  it("should decrypt 5.5, ECDH-ES with A128CBC-HS256 on P-256", async () => {
    const result = unwrap(await decryptWith(await privateKey(RFC7520_5_5_JWK, "ECDH-ES"), RFC7520_5_5_TOKEN));

    expect(result.header).toMatchObject({ alg: "ECDH-ES", enc: "A128CBC-HS256", epk: { crv: "P-256" } });
    expect(text(result.plaintext)).toBe(RFC7520_PLAINTEXT);
  });

  it("should decrypt 5.6, dir with A128GCM", async () => {
    // The cookbook names the content algorithm in the JWK's alg; a dir key is bound to it by enc instead.
    const jwk = Object.fromEntries(Object.entries(RFC7520_5_6_JWK).filter(([name]) => name !== "alg"));
    const key = unwrap(await importJweSecretKey(jwk, { alg: "dir", enc: "A128GCM" }));
    const result = unwrap(await decryptWith(key, RFC7520_5_6_TOKEN));

    expect(result.header).toMatchObject({ alg: "dir", enc: "A128GCM" });
    expect(text(result.plaintext)).toBe(RFC7520_PLAINTEXT);
    // As published, the JWK's alg differs from the key's, and a JWK's alg must name the key's own algorithm.
    expect(await importJweSecretKey(RFC7520_5_6_JWK, { alg: "dir", enc: "A128GCM" })).toEqual({
      ok: false,
      error: { issues: [{ code: "alg_mismatch", path: ["alg"] }] },
    });
  });

  it("should decrypt 5.8, A128KW with A128GCM", async () => {
    const key = unwrap(await importJweSecretKey(RFC7520_5_8_JWK, { alg: "A128KW" }));
    const result = unwrap(await decryptWith(key, RFC7520_5_8_TOKEN));

    expect(result.header).toMatchObject({ alg: "A128KW", enc: "A128GCM" });
    expect(text(result.plaintext)).toBe(RFC7520_PLAINTEXT);
  });

  it("should refuse 5.1 (RSA1_5), 5.3 (PBES2) and 5.9 (zip)", async () => {
    const rsa = await privateKey(RFC7520_5_2_JWK, "RSA-OAEP");
    const kw = unwrap(await importJweSecretKey(RFC7520_5_8_JWK, { alg: "A128KW" }));

    expect(await decryptWith(rsa, RFC7520_5_1_TOKEN)).toEqual({
      ok: false,
      error: { issues: [{ code: "unsupported_alg", path: ["header", "alg"] }] },
    });
    expect(await decryptWith(kw, RFC7520_5_3_TOKEN)).toEqual({
      ok: false,
      error: { issues: [{ code: "unsupported_alg", path: ["header", "alg"] }] },
    });
    expect(await decryptWith(kw, RFC7520_5_9_TOKEN)).toEqual({
      ok: false,
      error: { issues: [{ code: "malformed", path: ["header", "zip"] }] },
    });
  });

  it("should refuse a vector whose enc the decrypter does not accept", async () => {
    const key = unwrap(await importJweSecretKey(RFC7520_5_8_JWK, { alg: "A128KW" }));

    expect(await decryptWith(key, RFC7520_5_8_TOKEN, ["A256GCM"])).toEqual({
      ok: false,
      error: { issues: [{ code: "unsupported_enc", path: ["header", "enc"] }] },
    });
  });
});
