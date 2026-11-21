import { describe, expect, it } from "vitest";

import { encrypt } from "./encrypt";
import { generateJweKeyPair, generateJweSecretKey } from "./keys";
import { readJweHeader } from "./read-header";

const segment = (value: string): string => Buffer.from(value, "utf8").toString("base64url");
const forged = (header: object, rest = ["", "AAAAAAAAAAAAAAAA", "", "AAAAAAAAAAAAAAAAAAAAAA"]): string =>
  [segment(JSON.stringify(header)), ...rest].join(".");

describe("readJweHeader", () => {
  it("should return the frozen protected header of a token, without decrypting it", async () => {
    const pair = await generateJweKeyPair({ alg: "ECDH-ES+A256KW", kid: "enc-1" });
    const token = await encrypt({ plaintext: "secret", key: pair.publicKey, enc: "A256GCM", header: { typ: "x+jwe" } });

    const result = readJweHeader(token);

    expect(result).toMatchObject({
      ok: true,
      value: { alg: "ECDH-ES+A256KW", enc: "A256GCM", kid: "enc-1", typ: "x+jwe", epk: { crv: "P-256" } },
    });
    expect(result.ok && Object.isFrozen(result.value)).toBe(true);
    expect(result.ok && Object.isFrozen((result.value as { epk: object }).epk)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("should read a header whatever its enc, since it checks no decrypter's allow list", async () => {
    const key = await generateJweSecretKey({ alg: "dir", enc: "A128CBC-HS256" });
    const token = await encrypt({ plaintext: "x", key, enc: "A128CBC-HS256" });

    expect(readJweHeader(token)).toMatchObject({ ok: true, value: { alg: "dir", enc: "A128CBC-HS256" } });
  });

  it("should reject a value that is not a string, and a token without five segments, as malformed", () => {
    expect(readJweHeader(42)).toEqual({ ok: false, error: { issues: [{ code: "malformed" }] } });
    expect(readJweHeader("a.b.c")).toEqual({ ok: false, error: { issues: [{ code: "malformed" }] } });
    expect(readJweHeader(`${forged({ alg: "dir", enc: "A128GCM" })}.AAAA`)).toEqual({
      ok: false,
      error: { issues: [{ code: "malformed" }] },
    });
  });

  it("should check the token as a decrypter does up to its cryptography", () => {
    expect(
      readJweHeader(
        forged({ alg: "RSA1_5", enc: "A128GCM" }, ["AAAA", "AAAAAAAAAAAAAAAA", "", "AAAAAAAAAAAAAAAAAAAAAA"]),
      ),
    ).toEqual({
      ok: false,
      error: { issues: [{ code: "unsupported_alg", path: ["header", "alg"] }] },
    });
    expect(readJweHeader(forged({ alg: "dir", enc: "A192GCM" }))).toEqual({
      ok: false,
      error: { issues: [{ code: "unsupported_enc", path: ["header", "enc"] }] },
    });
    expect(readJweHeader(forged({ alg: "dir", enc: "A128GCM", zip: "DEF" }))).toMatchObject({ ok: false });
    expect(readJweHeader(forged({ alg: "dir", enc: "A128GCM" }, ["", "AAAA", "", "AAAAAAAAAAAAAAAAAAAAAA"]))).toEqual({
      ok: false,
      error: { issues: [{ code: "malformed", path: ["iv"] }] },
    });
    const duplicate = [
      segment('{"alg":"dir","alg":"dir","enc":"A128GCM"}'),
      "",
      "AAAAAAAAAAAAAAAA",
      "",
      "AAAAAAAAAAAAAAAAAAAAAA",
    ];
    expect(readJweHeader(duplicate.join("."))).toMatchObject({
      ok: false,
      error: { issues: [{ code: "duplicate_key" }] },
    });
  });

  it("should accept a well-formed header", () => {
    expect(readJweHeader(forged({ alg: "dir", enc: "A128GCM" }))).toMatchObject({ ok: true });
  });

  it("should reject a token longer than 16384 characters by default, and apply maxLength up to 65536", () => {
    const long = forged({ alg: "dir", enc: "A128GCM" }, [
      "",
      "AAAAAAAAAAAAAAAA",
      "A".repeat(16_384),
      "AAAAAAAAAAAAAAAAAAAAAA",
    ]);

    expect(readJweHeader(long)).toEqual({
      ok: false,
      error: { issues: [{ code: "too_large", params: { limit: "length", maximum: 16_384 } }] },
    });
    expect(readJweHeader(long, { maxLength: 65_536 })).toMatchObject({ ok: true });
    expect(readJweHeader(forged({ alg: "dir", enc: "A128GCM" }), { maxLength: 10 })).toEqual({
      ok: false,
      error: { issues: [{ code: "too_large", params: { limit: "length", maximum: 10 } }] },
    });
  });

  it.each([null, "x", { maxLength: 0 }, { maxLength: 65_537 }, { maxLength: 1.5 }, { other: true }])(
    "should throw TypeError for the options %j, even when the token is not a string",
    (options) => {
      expect(() => readJweHeader(42, options as never)).toThrow(TypeError);
    },
  );
});
