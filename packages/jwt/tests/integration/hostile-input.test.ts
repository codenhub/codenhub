import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  createKeySet,
  createRemoteKeySet,
  createVerifier,
  exportPrivateJwk,
  exportPublicJwk,
  generateKeyPair,
  importKeySet,
  importPublicKey,
  importSecretKey,
  readHeader,
  sign,
  type AsymmetricAlgorithm,
  type Jwk,
  type KeyPair,
  type KeySet,
  type SecretKey,
  type VerifierOptions,
} from "../../src";
import { RFC7515_A2_JWK, RFC7515_A2_TOKEN } from "./fixtures/rfc-vectors";
import { base64Url, failure, forge, rawSign, type RawAlgorithm, segmentOf, withSegment } from "./support";

const NOW_SECONDS = 1_800_000_000;
const now = () => NOW_SECONDS * 1000;
const ASYMMETRIC: readonly AsymmetricAlgorithm[] = ["ES256", "EdDSA", "Ed25519", "RS256", "PS256"];
const RAW_ALGORITHM: Record<AsymmetricAlgorithm, RawAlgorithm> = {
  ES256: "ES256",
  EdDSA: "Ed25519",
  Ed25519: "Ed25519",
  RS256: "RS256",
  PS256: "PS256",
};

const pairs = {} as Record<AsymmetricAlgorithm, KeyPair>;
const privateJwks = {} as Record<AsymmetricAlgorithm, JsonWebKey>;
const publicJwks = {} as Record<AsymmetricAlgorithm, Jwk>;
let secretKey: SecretKey;
let secretBytes: Uint8Array;

beforeAll(async () => {
  await Promise.all(
    ASYMMETRIC.map(async (alg) => {
      const pair = await generateKeyPair({ alg, kid: alg, extractable: true });
      pairs[alg] = pair;
      privateJwks[alg] = { ...(await exportPrivateJwk(pair.privateKey)) } as JsonWebKey;
      publicJwks[alg] = await exportPublicJwk(pair.publicKey);
    }),
  );
  secretBytes = crypto.getRandomValues(new Uint8Array(32));
  const imported = await importSecretKey(secretBytes, { alg: "HS256", kid: "HS256" });
  if (!imported.ok) {
    throw new Error("secret import failed");
  }
  secretKey = imported.value;
});

afterEach(() => {
  vi.useRealTimers();
});

const verifierOver = (keys: KeySet, options: Omit<VerifierOptions, "keys" | "now"> = {}) =>
  createVerifier({ keys, now, ...options });

/** A token signed by the RS256 key with an attacker-chosen header and payload. */
const rsaToken = (header: string, payload: string) => forge("RS256", privateJwks.RS256, header, payload);

/** A token signed by the HS256 secret with an attacker-chosen header and payload. */
const hmacToken = (header: string, payload: string) => forge("HS256", secretBytes, header, payload);

const hmacVerifier = (options: Omit<VerifierOptions, "keys" | "now"> = {}) =>
  verifierOver(createKeySet([secretKey]), options);

describe("alg none", () => {
  it.each(["none", "None", "NONE", "nOnE"])("should reject alg %s with a non-empty signature", async (alg) => {
    const token = `${segmentOf(`{"alg":"${alg}"}`)}.${segmentOf('{"sub":"admin"}')}.${segmentOf("sig")}`;

    expect(await hmacVerifier()(token)).toEqual(failure({ code: "unsupported_alg", path: ["header", "alg"] }));
  });

  it.each(["none", "None", "NONE", "nOnE"])("should reject alg %s with an empty signature", async (alg) => {
    const token = `${segmentOf(`{"alg":"${alg}"}`)}.${segmentOf('{"sub":"admin"}')}.`;

    expect(await hmacVerifier()(token)).toEqual(failure({ code: "malformed", path: ["signature"] }));
  });

  it("should reject the RFC 7515 Appendix A.5 unsecured JWS", async () => {
    const payloadSegment = RFC7515_A2_TOKEN.split(".")[1] as string;
    const token = `eyJhbGciOiJub25lIn0.${payloadSegment}.`;

    expect(await hmacVerifier()(token)).toEqual(failure({ code: "malformed", path: ["signature"] }));
  });

  it.each(["none", "None", "NONE", "nOnE"])("should refuse to read a header with alg %s", (alg) => {
    const token = `${segmentOf(`{"alg":"${alg}"}`)}.${segmentOf("{}")}.${segmentOf("sig")}`;

    expect(readHeader(token)).toEqual(failure({ code: "unsupported_alg", path: ["header", "alg"] }));
  });
});

describe("RS256 to HS256 confusion", () => {
  // The classic attack: HMAC-sign with bytes of the RSA public key, then claim HS256.
  const publicKeyEncodings = async (): Promise<Record<string, Uint8Array>> => {
    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      { ...publicJwks.RS256 } as JsonWebKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      true,
      ["verify"],
    );
    const spki = new Uint8Array(await crypto.subtle.exportKey("spki", cryptoKey));
    const pem = `-----BEGIN PUBLIC KEY-----\n${Buffer.from(spki).toString("base64")}\n-----END PUBLIC KEY-----\n`;
    return {
      jwk: new TextEncoder().encode(JSON.stringify(publicJwks.RS256)),
      spki,
      pem: new TextEncoder().encode(pem),
      modulus: Buffer.from(publicJwks.RS256.n as string, "base64url"),
    };
  };

  it.each(["jwk", "spki", "pem", "modulus"])(
    "should report alg_mismatch for HS256 keyed with the RSA public key's %s bytes and its kid",
    async (encoding) => {
      const secret = (await publicKeyEncodings())[encoding] as Uint8Array;
      const token = await forge("HS256", secret, '{"alg":"HS256","kid":"RS256"}', '{"sub":"admin"}');

      expect(await verifierOver(createKeySet([pairs.RS256.publicKey]))(token)).toEqual(
        failure({ code: "alg_mismatch", path: ["header", "alg"] }),
      );
    },
  );

  it.each(["jwk", "spki", "pem", "modulus"])(
    "should report no_matching_key for HS256 keyed with the RSA public key's %s bytes and no kid",
    async (encoding) => {
      const secret = (await publicKeyEncodings())[encoding] as Uint8Array;
      const token = await forge("HS256", secret, '{"alg":"HS256"}', '{"sub":"admin"}');

      expect(await verifierOver(createKeySet([pairs.RS256.publicKey]))(token)).toEqual(
        failure({ code: "no_matching_key" }),
      );
    },
  );

  it("should report no_matching_key for HS256 keyed with the JWK bytes against a JWKS holding that JWK", async () => {
    const keySet = await importKeySet({ keys: [{ ...publicJwks.RS256, alg: undefined }] });
    const secret = (await publicKeyEncodings()).jwk as Uint8Array;
    const token = await forge("HS256", secret, '{"alg":"HS256"}', '{"sub":"admin"}');

    expect(keySet.ok && (await verifierOver(keySet.value)(token))).toEqual(failure({ code: "no_matching_key" }));
  });

  it("should report alg_mismatch for an RS256 header naming the HS256 key", async () => {
    const token = await rsaToken('{"alg":"RS256","kid":"HS256"}', '{"sub":"admin"}');

    expect(await hmacVerifier()(token)).toEqual(failure({ code: "alg_mismatch", path: ["header", "alg"] }));
  });
});

describe("algorithm swaps between asymmetric keys", () => {
  it.each([
    ["ES256", "RS256"],
    ["RS256", "ES256"],
    ["RS256", "PS256"],
    ["PS256", "RS256"],
    ["EdDSA", "Ed25519"],
    ["Ed25519", "EdDSA"],
  ] as const)("should report alg_mismatch for a %s key's token relabelled %s", async (keyAlg, claimedAlg) => {
    const token = await forge(
      RAW_ALGORITHM[keyAlg],
      privateJwks[keyAlg],
      `{"alg":"${claimedAlg}","kid":"${keyAlg}"}`,
      '{"sub":"admin"}',
    );

    expect(await verifierOver(createKeySet([pairs[keyAlg].publicKey]))(token)).toEqual(
      failure({ code: "alg_mismatch", path: ["header", "alg"] }),
    );
  });

  it("should report bad_signature for an RS256 signature relabelled PS256 against a PS256 key with the same modulus", async () => {
    const token = await forge("RS256", privateJwks.PS256, '{"alg":"PS256","kid":"PS256"}', '{"sub":"admin"}');

    expect(await verifierOver(createKeySet([pairs.PS256.publicKey]))(token)).toEqual(
      failure({ code: "bad_signature" }),
    );
  });
});

describe("duplicate JSON keys", () => {
  it("should reject a header naming alg twice, the last one valid", async () => {
    const token = await hmacToken('{"alg":"none","alg":"HS256"}', '{"sub":"user-1"}');

    expect(await hmacVerifier()(token)).toEqual(failure({ code: "duplicate_key", path: ["header"] }));
  });

  it("should reject a header naming alg twice with the same value", async () => {
    const token = await hmacToken('{"alg":"HS256","alg":"HS256"}', '{"sub":"user-1"}');

    expect(await hmacVerifier()(token)).toEqual(failure({ code: "duplicate_key", path: ["header"] }));
  });

  it("should reject a header naming kid twice", async () => {
    const token = await hmacToken('{"alg":"HS256","kid":"other","kid":"HS256"}', '{"sub":"user-1"}');

    expect(await hmacVerifier()(token)).toEqual(failure({ code: "duplicate_key", path: ["header"] }));
  });

  it("should reject a validly signed payload naming sub twice", async () => {
    const token = await hmacToken('{"alg":"HS256"}', '{"sub":"user-1","sub":"admin"}');

    expect(await hmacVerifier()(token)).toEqual(failure({ code: "duplicate_key", path: ["payload"] }));
  });

  it("should reject a validly signed payload with a duplicate inside a nested object", async () => {
    const token = await hmacToken('{"alg":"HS256"}', '{"sub":"user-1","roles":{"admin":false,"admin":true}}');

    expect(await hmacVerifier()(token)).toEqual(failure({ code: "duplicate_key", path: ["payload"] }));
  });

  it("should reject member names that differ only by a JSON escape", async () => {
    const token = await hmacToken('{"alg":"HS256"}', '{"sub":"user-1","s\\u0075b":"admin"}');

    expect(await hmacVerifier()(token)).toEqual(failure({ code: "duplicate_key", path: ["payload"] }));
  });

  it("should keep a __proto__ claim as an own property without changing the payload's prototype", async () => {
    const token = await hmacToken('{"alg":"HS256"}', '{"__proto__":{"admin":true}}');
    const result = await hmacVerifier()(token);

    expect(
      result.ok && [
        Object.getPrototypeOf(result.value.payload) === Object.prototype,
        Object.hasOwn(result.value.payload, "__proto__"),
        (result.value.payload as { admin?: unknown }).admin,
      ],
    ).toEqual([true, true, undefined]);
  });
});

describe("non-canonical base64url", () => {
  const validToken = () => sign({ payload: { sub: "user-1" }, key: secretKey });

  it.each([
    ["padding on the header", 0, (segment: string) => `${segment}==`],
    ["a + in the payload", 1, (segment: string) => `${segment.slice(0, -1)}+`],
    ["a / in the payload", 1, (segment: string) => `${segment.slice(0, -1)}/`],
    ["a space in the payload", 1, (segment: string) => `${segment.slice(0, 2)} ${segment.slice(3)}`],
    [
      "a length of 4n+1 in the payload",
      1,
      (segment: string) => segment.padEnd(segment.length + ((5 - (segment.length % 4)) % 4), "A"),
    ],
  ] as const)("should reject %s as malformed", async (_, index, mutate) => {
    const token = await validToken();
    const segment = token.split(".")[index] as string;
    const names = ["header", "payload", "signature"];

    expect(await hmacVerifier()(withSegment(token, index, mutate(segment)))).toEqual(
      failure({ code: "malformed", path: [names[index] as string] }),
    );
  });

  it("should reject a signature with non-zero unused trailing bits", async () => {
    const token = await validToken();
    const signature = token.split(".")[2] as string;
    // 32 bytes take 43 characters; the last one carries 2 unused bits. Setting the lowest one keeps the bytes.
    const last = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".indexOf(signature.at(-1) as string);
    const altered = `${signature.slice(0, -1)}${"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"[last | 1]}`;

    expect(await hmacVerifier()(withSegment(token, 2, altered))).toEqual(
      failure({ code: "malformed", path: ["signature"] }),
    );
  });

  it("should reject a header with non-zero unused trailing bits", async () => {
    // '{"alg":"HS256"}' is 15 bytes, 20 characters with no unused bits; one more byte leaves 4 unused bits.
    const token = await hmacToken('{"alg":"HS256"} ', '{"sub":"user-1"}');
    const header = token.split(".")[0] as string;
    const last = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".indexOf(header.at(-1) as string);
    const altered = `${header.slice(0, -1)}${"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"[last | 1]}`;

    expect(await hmacVerifier()(withSegment(token, 0, altered))).toEqual(
      failure({ code: "malformed", path: ["header"] }),
    );
  });
});

describe("token shape", () => {
  it("should not take alg from a __proto__ member of the header", async () => {
    const token = await hmacToken('{"__proto__":{"alg":"HS256"}}', '{"sub":"user-1"}');

    expect(await hmacVerifier()(token)).toEqual(failure({ code: "unsupported_alg", path: ["header", "alg"] }));
  });

  it("should report bad_signature for an ES256 signature in DER form", async () => {
    const token = await sign({ payload: { sub: "user-1" }, key: pairs.ES256.privateKey });
    const raw = Buffer.from(token.split(".")[2] as string, "base64url");
    const integer = (bytes: Buffer) => {
      const trimmed = bytes.subarray(bytes.findIndex((byte) => byte !== 0));
      const value = (trimmed[0] as number) >= 0x80 ? Buffer.concat([Buffer.from([0]), trimmed]) : trimmed;
      return Buffer.concat([Buffer.from([0x02, value.length]), value]);
    };
    const body = Buffer.concat([integer(raw.subarray(0, 32)), integer(raw.subarray(32))]);
    const der = Buffer.concat([Buffer.from([0x30, body.length]), body]);

    expect(await verifierOver(createKeySet([pairs.ES256.publicKey]))(withSegment(token, 2, base64Url(der)))).toEqual(
      failure({ code: "bad_signature" }),
    );
  });

  it.each([
    ["two segments", "a.b"],
    ["four segments", "a.b.c.d"],
    ["five segments, as a JWE", "a.b.c.d.e"],
    ["an empty string", ""],
  ])("should reject %s as malformed", async (_, token) => {
    expect(await hmacVerifier()(token)).toEqual(failure({ code: "malformed" }));
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a number", 42],
    ["an object", { toString: () => "a.b.c" }],
    ["a String object", new String("a.b.c")],
  ])("should reject %s as malformed", async (_, token) => {
    expect(await hmacVerifier()(token)).toEqual(failure({ code: "malformed" }));
  });

  it("should reject a header that is a JSON array", async () => {
    const token = await hmacToken('["HS256"]', '{"sub":"user-1"}');

    expect(await hmacVerifier()(token)).toEqual(failure({ code: "malformed", path: ["header"] }));
  });

  it("should reject a header with a byte order mark", async () => {
    const token = await hmacToken('﻿{"alg":"HS256"}', '{"sub":"user-1"}');

    expect(await hmacVerifier()(token)).toEqual(failure({ code: "malformed", path: ["header"] }));
  });

  it("should reject a validly signed payload that is a JSON string", async () => {
    const token = await hmacToken('{"alg":"HS256"}', '"admin"');

    expect(await hmacVerifier()(token)).toEqual(failure({ code: "malformed", path: ["payload"] }));
  });

  it("should reject a validly signed payload of invalid UTF-8", async () => {
    const signingInput = `${segmentOf('{"alg":"HS256"}')}.${base64Url(Uint8Array.from([0x7b, 0xff, 0x7d]))}`;
    const signature = base64Url(await rawSign("HS256", secretBytes, signingInput));

    expect(await hmacVerifier()(`${signingInput}.${signature}`)).toEqual(
      failure({ code: "malformed", path: ["payload"] }),
    );
  });
});

describe("oversized input", () => {
  it("should reject a token one character over the default maxLength", async () => {
    const token = `${segmentOf('{"alg":"HS256"}')}.${"A".repeat(8192)}.AAAA`.slice(0, 8193);

    expect(await hmacVerifier()(token)).toEqual(
      failure({ code: "too_large", params: { limit: "length", maximum: 8192 } }),
    );
  });

  it("should reject a 16 MiB token by its length alone", async () => {
    const token = "A".repeat(16 * 1024 * 1024);

    expect(await hmacVerifier()(token)).toEqual(
      failure({ code: "too_large", params: { limit: "length", maximum: 8192 } }),
    );
  });

  it("should reject a 16 MiB string of dots by its length alone", async () => {
    expect(await hmacVerifier()(".".repeat(16 * 1024 * 1024))).toEqual(
      failure({ code: "too_large", params: { limit: "length", maximum: 8192 } }),
    );
  });

  it("should reject a 16 MiB token in readHeader by its length alone", () => {
    expect(readHeader("A".repeat(16 * 1024 * 1024))).toEqual(
      failure({ code: "too_large", params: { limit: "length", maximum: 8192 } }),
    );
  });

  it("should reject a header nested 20,000 arrays deep at the depth limit", async () => {
    const header = `{"alg":"HS256","x":${"[".repeat(20_000)}${"]".repeat(20_000)}}`;
    const token = await hmacToken(header, '{"sub":"user-1"}');

    expect(await hmacVerifier({ maxLength: 65_536 })(token)).toEqual(
      failure({ code: "too_large", path: ["header"], params: { limit: "depth", maximum: 32 } }),
    );
  });

  it("should reject a validly signed payload nested 5,000 objects deep at the depth limit", async () => {
    const payload = `${'{"a":'.repeat(5_000)}1${"}".repeat(5_000)}`;
    const token = await hmacToken('{"alg":"HS256"}', payload);

    expect(await hmacVerifier({ maxLength: 65_536 })(token)).toEqual(
      failure({ code: "too_large", path: ["payload"], params: { limit: "depth", maximum: 32 } }),
    );
  });

  it("should accept a payload nested exactly 32 deep", async () => {
    const payload = `{"sub":"user-1","a":${"[".repeat(31)}${"]".repeat(31)}}`;
    const token = await hmacToken('{"alg":"HS256"}', payload);
    const result = await hmacVerifier()(token);

    expect(result.ok).toBe(true);
  });

  it("should reject a payload nested 33 deep", async () => {
    const payload = `{"sub":"user-1","a":${"[".repeat(32)}${"]".repeat(32)}}`;
    const token = await hmacToken('{"alg":"HS256"}', payload);

    expect(await hmacVerifier()(token)).toEqual(
      failure({ code: "too_large", path: ["payload"], params: { limit: "depth", maximum: 32 } }),
    );
  });
});

describe("crit", () => {
  it.each([
    ["an unknown extension", '{"alg":"HS256","crit":["urn:example:ext"],"urn:example:ext":1}'],
    ["a registered claim name", '{"alg":"HS256","crit":["exp"],"exp":1}'],
    ["b64", '{"alg":"HS256","crit":["b64"],"b64":false}'],
    ["an empty list", '{"alg":"HS256","crit":[]}'],
    ["a non-list value", '{"alg":"HS256","crit":"exp"}'],
  ])("should reject a validly signed header whose crit names %s", async (_, header) => {
    const token = await hmacToken(header, '{"sub":"user-1"}');

    expect(await hmacVerifier()(token)).toEqual(failure({ code: "unsupported_crit", path: ["header", "crit"] }));
  });
});

describe("kid", () => {
  it("should report unknown_kid for a kid the key set does not hold", async () => {
    const token = await hmacToken('{"alg":"HS256","kid":"other"}', '{"sub":"user-1"}');

    expect(await hmacVerifier()(token)).toEqual(failure({ code: "unknown_kid", path: ["header", "kid"] }));
  });

  it("should report unknown_kid for a kid differing only in case", async () => {
    const token = await hmacToken('{"alg":"HS256","kid":"hs256"}', '{"sub":"user-1"}');

    expect(await hmacVerifier()(token)).toEqual(failure({ code: "unknown_kid", path: ["header", "kid"] }));
  });

  it("should report malformed for a kid that is not text", async () => {
    const token = await hmacToken('{"alg":"HS256","kid":1}', '{"sub":"user-1"}');

    expect(await hmacVerifier()(token)).toEqual(failure({ code: "malformed", path: ["header", "kid"] }));
  });

  it("should ignore a jwk header naming the attacker's own key", async () => {
    const attacker = await generateKeyPair({ alg: "ES256", extractable: true });
    const header = JSON.stringify({ alg: "ES256", kid: "ES256", jwk: await exportPublicJwk(attacker.publicKey) });
    const token = await forge("ES256", { ...(await exportPrivateJwk(attacker.privateKey)) }, header, '{"sub":"admin"}');

    expect(await verifierOver(createKeySet([pairs.ES256.publicKey]))(token)).toEqual(
      failure({ code: "bad_signature" }),
    );
  });
});

describe("time claims", () => {
  const timeToken = (claims: object) => hmacToken('{"alg":"HS256"}', JSON.stringify(claims));

  it("should report expired for exp one second ago", async () => {
    expect(await hmacVerifier()(await timeToken({ exp: NOW_SECONDS - 1 }))).toEqual(
      failure({ code: "expired", path: ["payload", "exp"] }),
    );
  });

  it("should report expired for exp equal to now", async () => {
    expect(await hmacVerifier()(await timeToken({ exp: NOW_SECONDS }))).toEqual(
      failure({ code: "expired", path: ["payload", "exp"] }),
    );
  });

  it("should accept exp within the clock tolerance", async () => {
    const result = await hmacVerifier({ clockTolerance: 30 })(await timeToken({ exp: NOW_SECONDS - 29 }));

    expect(result.ok).toBe(true);
  });

  it("should report not_yet_valid for nbf one second ahead", async () => {
    expect(await hmacVerifier()(await timeToken({ nbf: NOW_SECONDS + 1 }))).toEqual(
      failure({ code: "not_yet_valid", path: ["payload", "nbf"] }),
    );
  });

  it("should report issued_in_future for iat one second ahead", async () => {
    expect(await hmacVerifier()(await timeToken({ iat: NOW_SECONDS + 1 }))).toEqual(
      failure({ code: "issued_in_future", path: ["payload", "iat"] }),
    );
  });

  it("should report every failing time claim at once", async () => {
    expect(
      await hmacVerifier()(await timeToken({ exp: NOW_SECONDS - 1, nbf: NOW_SECONDS + 1, iat: NOW_SECONDS + 1 })),
    ).toEqual(
      failure(
        { code: "expired", path: ["payload", "exp"] },
        { code: "not_yet_valid", path: ["payload", "nbf"] },
        { code: "issued_in_future", path: ["payload", "iat"] },
      ),
    );
  });

  it("should report invalid_claim for exp of 1e400, which JSON reads as Infinity", async () => {
    const token = await hmacToken('{"alg":"HS256"}', '{"exp":1e400}');

    expect(await hmacVerifier()(token)).toEqual(failure({ code: "invalid_claim", path: ["payload", "exp"] }));
  });

  it("should report invalid_claim for exp of -1e400, which JSON reads as -Infinity", async () => {
    const token = await hmacToken('{"alg":"HS256"}', '{"nbf":-1e400}');

    expect(await hmacVerifier()(token)).toEqual(failure({ code: "invalid_claim", path: ["payload", "nbf"] }));
  });

  it("should report invalid_claim for an exp given as text", async () => {
    expect(await hmacVerifier()(await timeToken({ exp: String(NOW_SECONDS + 60) }))).toEqual(
      failure({ code: "invalid_claim", path: ["payload", "exp"] }),
    );
  });

  it("should report invalid_claim for an exp of null", async () => {
    expect(await hmacVerifier()(await timeToken({ exp: null }))).toEqual(
      failure({ code: "invalid_claim", path: ["payload", "exp"] }),
    );
  });
});

describe("audience", () => {
  const audToken = (aud: unknown) => hmacToken('{"alg":"HS256"}', JSON.stringify({ aud }));

  it("should accept an aud array containing the configured audience", async () => {
    const result = await hmacVerifier({ audience: "app" })(await audToken(["other", "app"]));

    expect(result.ok).toBe(true);
  });

  it("should accept an aud array sharing one entry with configured audiences", async () => {
    const result = await hmacVerifier({ audience: ["web", "app"] })(await audToken(["app", "third"]));

    expect(result.ok).toBe(true);
  });

  it("should report wrong_audience for an aud array without the configured audience", async () => {
    expect(await hmacVerifier({ audience: "app" })(await audToken(["other", "third"]))).toEqual(
      failure({ code: "wrong_audience", path: ["payload", "aud"] }),
    );
  });

  it("should report wrong_audience for an empty aud array", async () => {
    expect(await hmacVerifier({ audience: "app" })(await audToken([]))).toEqual(
      failure({ code: "wrong_audience", path: ["payload", "aud"] }),
    );
  });

  it("should report wrong_audience for an aud differing only in case", async () => {
    expect(await hmacVerifier({ audience: "app" })(await audToken("APP"))).toEqual(
      failure({ code: "wrong_audience", path: ["payload", "aud"] }),
    );
  });

  it("should report invalid_claim for an aud array holding a number", async () => {
    expect(await hmacVerifier({ audience: "app" })(await audToken(["app", 1]))).toEqual(
      failure({ code: "invalid_claim", path: ["payload", "aud"] }),
    );
  });

  it("should report invalid_claim for an aud array nested in an array", async () => {
    expect(await hmacVerifier({ audience: "app" })(await audToken([["app"]]))).toEqual(
      failure({ code: "invalid_claim", path: ["payload", "aud"] }),
    );
  });

  it("should report missing_claim for a token without aud when an audience is configured", async () => {
    const token = await hmacToken('{"alg":"HS256"}', '{"sub":"user-1"}');

    expect(await hmacVerifier({ audience: "app" })(token)).toEqual(
      failure({ code: "missing_claim", path: ["payload", "aud"], params: { claim: "aud" } }),
    );
  });
});

describe("remote JWKS end to end", () => {
  const URL_STRING = "https://issuer.example/jwks.json";
  const HEADER = { kid: "ES256" };

  const jwksResponse = (...keys: object[]) => new Response(JSON.stringify({ keys }), { status: 200 });

  const countingFetch = (...responders: (() => Response | Promise<Response>)[]) => {
    let calls = 0;
    const fetch = vi.fn(async (): Promise<Response> => {
      const responder = responders[Math.min(calls, responders.length - 1)] as () => Response | Promise<Response>;
      calls += 1;
      return responder();
    });
    return fetch;
  };

  const createClock = () => {
    let seconds = NOW_SECONDS;
    return { now: () => seconds * 1000, advance: (by: number) => (seconds += by) };
  };

  const esToken = () => sign({ payload: { sub: "user-1" }, key: pairs.ES256.privateKey, header: HEADER });

  it("should verify a token against keys fetched from the endpoint", async () => {
    const fetch = countingFetch(() => jwksResponse(publicJwks.ES256));
    const verify = createVerifier({ keys: createRemoteKeySet({ url: URL_STRING, fetch, now }), now });

    const result = await verify(await esToken());

    expect(result.ok && result.value.payload).toEqual({ sub: "user-1" });
  });

  it("should report key_fetch_failed with timeout for an endpoint that never answers", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn((): Promise<Response> => new Promise(() => undefined));
    const verify = createVerifier({ keys: createRemoteKeySet({ url: URL_STRING, fetch, timeout: 1, now }), now });
    const token = await esToken();

    const pending = verify(token);
    await vi.advanceTimersByTimeAsync(1000);

    expect(await pending).toEqual(failure({ code: "key_fetch_failed", params: { reason: "timeout" } }));
  });

  it("should report key_fetch_failed with too_large for an endless body", async () => {
    const endless = () =>
      new Response(
        new ReadableStream<Uint8Array>({ pull: (controller) => controller.enqueue(new Uint8Array(65_536)) }),
        {
          status: 200,
        },
      );
    const verify = createVerifier({
      keys: createRemoteKeySet({ url: URL_STRING, fetch: countingFetch(endless), now }),
      now,
    });

    expect(await verify(await esToken())).toEqual(
      failure({ code: "key_fetch_failed", params: { reason: "too_large" } }),
    );
  });

  it("should report key_fetch_failed with invalid_response for a JWKS nested 100,000 deep", async () => {
    const body = `{"keys":${"[".repeat(100_000)}${"]".repeat(100_000)}}`;
    const verify = createVerifier({
      keys: createRemoteKeySet({
        url: URL_STRING,
        fetch: countingFetch(() => new Response(body, { status: 200 })),
        maxResponseBytes: 1_048_576,
        now,
      }),
      now,
    });

    expect(await verify(await esToken())).toEqual(
      failure({ code: "key_fetch_failed", params: { reason: "invalid_response" } }),
    );
  });

  it("should keep verifying with the last good keys while a flapping endpoint fails", async () => {
    const clock = createClock();
    const fetch = countingFetch(
      () => jwksResponse(publicJwks.ES256),
      () => new Response(null, { status: 503 }),
    );
    const verify = createVerifier({
      keys: createRemoteKeySet({ url: URL_STRING, fetch, cacheTtl: 600, now: clock.now }),
      now: clock.now,
    });
    const token = await esToken();
    await verify(token);
    clock.advance(601);

    const result = await verify(token);

    expect([result.ok, fetch.mock.calls.length]).toEqual([true, 2]);
  });

  it("should verify a token from a rotated-in key after the cooldown", async () => {
    const clock = createClock();
    const fetch = countingFetch(
      () => jwksResponse(publicJwks.ES256),
      () => jwksResponse(publicJwks.ES256, publicJwks.EdDSA),
    );
    const verify = createVerifier({
      keys: createRemoteKeySet({ url: URL_STRING, fetch, cooldown: 30, now: clock.now }),
      now: clock.now,
    });
    await verify(await esToken());
    clock.advance(30);
    const rotated = await sign({ payload: { sub: "user-1" }, key: pairs.EdDSA.privateKey });

    const result = await verify(rotated);

    expect(result.ok && result.value.header).toEqual({ alg: "EdDSA", kid: "EdDSA" });
  });

  it("should fetch at most once per cooldown for a flood of tokens with unknown kids", async () => {
    const clock = createClock();
    const fetch = countingFetch(() => jwksResponse(publicJwks.ES256));
    const verify = createVerifier({
      keys: createRemoteKeySet({ url: URL_STRING, fetch, cooldown: 30, now: clock.now }),
      now: clock.now,
    });
    await verify(await esToken());
    clock.advance(30);
    const flood = await Promise.all(
      Array.from({ length: 200 }, (_, index) =>
        forge("ES256", privateJwks.ES256, `{"alg":"ES256","kid":"miss-${index}"}`, '{"sub":"user-1"}'),
      ),
    );

    const results = await Promise.all(flood.map((token) => verify(token)));
    clock.advance(10);
    await Promise.all(flood.map((token) => verify(token)));

    expect([new Set(results.map((result) => JSON.stringify(result))), fetch.mock.calls.length]).toEqual([
      new Set([JSON.stringify(failure({ code: "unknown_kid", path: ["header", "kid"] }))]),
      2,
    ]);
  });
});

// RFC 8017 Section 3.1 requires an RSA public exponent from 3 through n - 1. With e = 1 a signature is its own
// encoded message, so anyone can sign for that key without the private key.
describe("RSA public exponent", () => {
  it.each([
    ["1", "AQ"],
    ["2", "Ag"],
  ])("should refuse an RSA public key with exponent %s", async (_, e) => {
    const result = await importPublicKey({ kty: "RSA", n: RFC7515_A2_JWK.n, e }, { alg: "RS256" });

    expect(result).toEqual(failure({ code: "invalid_key", path: ["e"] }));
  });

  it("should not verify a token forged without the private key for an RSA key with exponent 1", async () => {
    const imported = await importPublicKey({ kty: "RSA", n: RFC7515_A2_JWK.n, e: "AQ" }, { alg: "RS256" });
    const signingInput = `${segmentOf('{"alg":"RS256"}')}.${segmentOf('{"sub":"admin"}')}`;
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(signingInput)));
    const digestInfo = Buffer.concat([Buffer.from("3031300d060960864801650304020105000420", "hex"), digest]);
    const encoded = Buffer.concat([
      Buffer.from([0x00, 0x01]),
      Buffer.alloc(256 - digestInfo.length - 3, 0xff),
      Buffer.from([0x00]),
      digestInfo,
    ]);
    const token = `${signingInput}.${base64Url(encoded)}`;

    const result = imported.ok ? await verifierOver(createKeySet([imported.value]))(token) : imported;

    expect(result).toEqual(failure({ code: "invalid_key", path: ["e"] }));
  });
});
