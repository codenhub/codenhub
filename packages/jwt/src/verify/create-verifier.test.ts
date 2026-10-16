import { beforeAll, describe, expect, it } from "vitest";

import { fail } from "../core/result";
import type { AsymmetricAlgorithm, KeySet, SecretKey } from "../core/types";
import { decodeBase64Url, encodeBase64Url } from "../encoding/base64url";
import { generateKeyPair, generateSecretKey, type KeyPair } from "../keys/generate";
import { importSecretKey } from "../keys/import";
import { getKeyEntry } from "../keys/registry";
import { valueOf } from "../keys/test-fixtures";
import { sign } from "../sign/sign";
import { createVerifier } from "./create-verifier";
import { clockAt, failure, keySetOf, NOW_SECONDS, segmentOf, signRaw } from "./test-support";

const ASYMMETRIC: readonly AsymmetricAlgorithm[] = ["ES256", "EdDSA", "Ed25519", "RS256", "PS256"];
const PAYLOAD = { sub: "user-1", exp: NOW_SECONDS + 60 };

const pairs = {} as Record<AsymmetricAlgorithm, KeyPair>;
let secretKey: SecretKey;

beforeAll(async () => {
  const generated = await Promise.all(ASYMMETRIC.map((alg) => generateKeyPair({ alg, kid: `${alg}-key` })));
  for (const [index, alg] of ASYMMETRIC.entries()) {
    pairs[alg] = generated[index] as KeyPair;
  }
  secretKey = await generateSecretKey({ alg: "HS256", kid: "HS256-key" });
});

const verifierFor = (keys: KeySet) => createVerifier({ keys, now: clockAt() });

/** Replaces one segment of a compact token. */
const withSegment = (token: string, index: number, segment: string): string => {
  const segments = token.split(".");
  segments[index] = segment;
  return segments.join(".");
};

const signatureOf = (token: string): Uint8Array => decodeBase64Url(token.split(".")[2] as string) as Uint8Array;

describe("createVerifier round trip", () => {
  it.each(ASYMMETRIC)("should verify a token signed with %s", async (alg) => {
    const { privateKey, publicKey } = pairs[alg];
    const token = await sign({ payload: PAYLOAD, key: privateKey, header: { typ: "JWT" } });

    expect(await verifierFor(keySetOf(publicKey))(token)).toEqual({
      ok: true,
      value: { header: { alg, kid: `${alg}-key`, typ: "JWT" }, payload: PAYLOAD, key: publicKey },
    });
  });

  it("should verify a token signed with HS256", async () => {
    const token = await sign({ payload: PAYLOAD, key: secretKey });

    expect(await verifierFor(keySetOf(secretKey))(token)).toEqual({
      ok: true,
      value: { header: { alg: "HS256", kid: "HS256-key" }, payload: PAYLOAD, key: secretKey },
    });
  });

  it("should deep-freeze the result", async () => {
    const payload = { sub: "user-1", roles: ["admin"], profile: { name: "n" } };
    const result = await verifierFor(keySetOf(secretKey))(await sign({ payload, key: secretKey }));
    const { header, payload: verified, key } = valueOf(result);

    expect(
      [result, valueOf(result), header, verified, verified.roles, verified.profile, key].every(Object.isFrozen),
    ).toBe(true);
  });

  it("should deep-freeze a failure", async () => {
    const result = await verifierFor(keySetOf(secretKey))("a.b");

    const parts = result.ok ? [] : [result, result.error, result.error.issues, result.error.issues[0]];

    expect(parts.length > 0 && parts.every(Object.isFrozen)).toBe(true);
  });
});

describe("createVerifier structure", () => {
  it.each([
    ["a number", 42],
    ["null", null],
    ["an object", { token: "a.b.c" }],
    ["undefined", undefined],
  ])("should report malformed for %s", async (_, token) => {
    expect(await verifierFor(keySetOf(secretKey))(token)).toEqual(failure({ code: "malformed" }));
  });

  it("should report a token over maxLength before anything else", async () => {
    const verify = createVerifier({ keys: keySetOf(secretKey), maxLength: 10, now: clockAt() });

    expect(await verify("%".repeat(11))).toEqual(
      failure({ code: "too_large", params: { limit: "length", maximum: 10 } }),
    );
  });

  it("should apply the default maxLength of 8192", async () => {
    expect(await verifierFor(keySetOf(secretKey))("a".repeat(8193))).toEqual(
      failure({ code: "too_large", params: { limit: "length", maximum: 8192 } }),
    );
  });
});

describe("createVerifier algorithm confusion", () => {
  it("should reject a PS256 signature presented as RS256", async () => {
    const token = await signRaw(pairs.PS256.privateKey, '{"alg":"RS256"}', '{"sub":"user-1"}');

    expect(await verifierFor(keySetOf(pairs.PS256.publicKey))(token)).toEqual(
      failure({ code: "alg_mismatch", path: ["header", "alg"] }),
    );
  });

  it("should reject an RS256 signature presented as PS256", async () => {
    const token = await signRaw(pairs.RS256.privateKey, '{"alg":"PS256"}', '{"sub":"user-1"}');

    expect(await verifierFor(keySetOf(pairs.RS256.publicKey))(token)).toEqual(
      failure({ code: "alg_mismatch", path: ["header", "alg"] }),
    );
  });

  it("should reject an ES256 signature presented as RS256", async () => {
    const token = await signRaw(pairs.ES256.privateKey, '{"alg":"RS256"}', '{"sub":"user-1"}');

    expect(await verifierFor(keySetOf(pairs.ES256.publicKey))(token)).toEqual(
      failure({ code: "alg_mismatch", path: ["header", "alg"] }),
    );
  });

  it("should reject an RS256 signature relabelled ES256 for an ES256 key as a bad signature", async () => {
    const token = await signRaw(pairs.RS256.privateKey, '{"alg":"ES256"}', '{"sub":"user-1"}');

    expect(await verifierFor(keySetOf(pairs.ES256.publicKey))(token)).toEqual(failure({ code: "bad_signature" }));
  });

  it("should reject HS256 signed with the RSA public key's bytes as the secret", async () => {
    const { publicKey } = pairs.RS256;
    const spki = new Uint8Array(await crypto.subtle.exportKey("spki", getKeyEntry(publicKey).cryptoKey));
    const forgedSecret = valueOf(await importSecretKey(spki, { alg: "HS256" }));
    const token = await signRaw(forgedSecret, '{"alg":"HS256"}', '{"sub":"admin"}');

    expect(await verifierFor(keySetOf(publicKey))(token)).toEqual(
      failure({ code: "alg_mismatch", path: ["header", "alg"] }),
    );
  });

  it("should reject an Ed25519 key for an EdDSA header", async () => {
    const token = await signRaw(pairs.Ed25519.privateKey, '{"alg":"EdDSA"}', '{"sub":"user-1"}');

    expect(await verifierFor(keySetOf(pairs.Ed25519.publicKey))(token)).toEqual(
      failure({ code: "alg_mismatch", path: ["header", "alg"] }),
    );
  });

  it.each(["none", "None", "NONE", "nOnE"])("should reject alg %s with a signature", async (alg) => {
    const token = `${segmentOf(`{"alg":"${alg}"}`)}.${segmentOf('{"sub":"admin"}')}.AAAA`;

    expect(await verifierFor(keySetOf(secretKey))(token)).toEqual(
      failure({ code: "unsupported_alg", path: ["header", "alg"] }),
    );
  });

  it("should reject alg none with an empty signature", async () => {
    const token = `${segmentOf('{"alg":"none"}')}.${segmentOf('{"sub":"admin"}')}.`;

    expect(await verifierFor(keySetOf(secretKey))(token)).toEqual(failure({ code: "malformed", path: ["signature"] }));
  });
});

describe("createVerifier signature", () => {
  it("should reject a token whose payload was changed", async () => {
    const token = await sign({ payload: { sub: "user-1" }, key: secretKey });

    expect(await verifierFor(keySetOf(secretKey))(withSegment(token, 1, segmentOf('{"sub":"admin"}')))).toEqual(
      failure({ code: "bad_signature" }),
    );
  });

  it.each([...ASYMMETRIC, "HS256" as const])("should reject a %s signature with one bit flipped", async (alg) => {
    const [signingKey, verificationKey] =
      alg === "HS256" ? [secretKey, secretKey] : [pairs[alg].privateKey, pairs[alg].publicKey];
    const token = await sign({ payload: { sub: "user-1" }, key: signingKey });
    const signature = signatureOf(token);
    signature[0] = (signature[0] as number) ^ 1;

    expect(await verifierFor(keySetOf(verificationKey))(withSegment(token, 2, encodeBase64Url(signature)))).toEqual(
      failure({ code: "bad_signature" }),
    );
  });

  it.each([
    ["one byte short", -1],
    ["one byte long", 1],
  ])("should reject an ES256 signature %s", async (_, change) => {
    const token = await sign({ payload: { sub: "user-1" }, key: pairs.ES256.privateKey });
    const signature = signatureOf(token);
    const resized = change < 0 ? signature.slice(0, change) : Uint8Array.from([...signature, 0]);

    expect(await verifierFor(keySetOf(pairs.ES256.publicKey))(withSegment(token, 2, encodeBase64Url(resized)))).toEqual(
      failure({ code: "bad_signature" }),
    );
  });

  it("should reject an RS256 signature one byte short", async () => {
    const token = await sign({ payload: { sub: "user-1" }, key: pairs.RS256.privateKey });
    const shortened = signatureOf(token).slice(1);

    expect(
      await verifierFor(keySetOf(pairs.RS256.publicKey))(withSegment(token, 2, encodeBase64Url(shortened))),
    ).toEqual(failure({ code: "bad_signature" }));
  });

  it("should report bad_signature, not malformed, for an unparsable payload under a bad signature", async () => {
    const token = `${segmentOf('{"alg":"HS256"}')}.${segmentOf("not json")}.${encodeBase64Url(new Uint8Array(32))}`;

    expect(await verifierFor(keySetOf(secretKey))(token)).toEqual(failure({ code: "bad_signature" }));
  });

  it("should report bad_signature for an unparsable payload under a signature of the wrong length", async () => {
    const token = `${segmentOf('{"alg":"HS256"}')}.${segmentOf('{"a":1,"a":2}')}.AAAA`;

    expect(await verifierFor(keySetOf(secretKey))(token)).toEqual(failure({ code: "bad_signature" }));
  });

  it("should report malformed for an unparsable payload under a valid signature", async () => {
    const token = await signRaw(secretKey, '{"alg":"HS256"}', "not json");

    expect(await verifierFor(keySetOf(secretKey))(token)).toEqual(failure({ code: "malformed", path: ["payload"] }));
  });
});

describe("createVerifier key set", () => {
  it("should return the key set's failure as it is", async () => {
    const keys: KeySet = { select: async () => fail({ code: "unknown_kid", path: ["header", "kid"] }) };
    const token = await sign({ payload: {}, key: secretKey });

    expect(await verifierFor(keys)(token)).toEqual(failure({ code: "unknown_kid", path: ["header", "kid"] }));
  });

  it.each([
    [
      "throws",
      () => {
        throw new Error("boom");
      },
    ],
    ["rejects", async () => Promise.reject(new Error("boom"))],
    ["returns undefined", async () => undefined],
    ["returns a failure without issues", async () => ({ ok: false, error: { issues: [] } })],
    [
      "returns a look-alike key",
      async () => ({ ok: true, value: { kind: "secret", alg: "HS256", extractable: false } }),
    ],
  ])("should report key_fetch_failed when select %s", async (_, select) => {
    const token = await sign({ payload: {}, key: secretKey });

    expect(await verifierFor({ select } as unknown as KeySet)(token)).toEqual(
      failure({ code: "key_fetch_failed", params: { reason: "key_set_error" } }),
    );
  });

  it("should report key_fetch_failed when select returns a private key", async () => {
    const { privateKey } = pairs.ES256;
    const keys = { select: async () => ({ ok: true, value: privateKey }) } as unknown as KeySet;
    const token = await sign({ payload: {}, key: privateKey });

    expect(await verifierFor(keys)(token)).toEqual(
      failure({ code: "key_fetch_failed", params: { reason: "key_set_error" } }),
    );
  });

  it("should pass the parsed header to select", async () => {
    const headers: unknown[] = [];
    const keys: KeySet = {
      select: async (header) => {
        headers.push(header);
        return fail({ code: "no_matching_key" });
      },
    };

    await verifierFor(keys)(await sign({ payload: {}, key: secretKey, header: { typ: "JWT" } }));

    expect(headers).toEqual([{ alg: "HS256", kid: "HS256-key", typ: "JWT" }]);
  });
});
