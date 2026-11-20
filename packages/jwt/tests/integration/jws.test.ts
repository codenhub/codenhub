import { runInNewContext } from "node:vm";

import * as jose from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import {
  createJwsVerifier,
  createKeySet,
  importPrivateKey,
  importPublicKey,
  importSecretKey,
  signGeneralJws,
  signJws,
  type AsymmetricAlgorithm,
  type JwtResult,
  type SecretKey,
  type SigningKey,
  type VerificationKey,
} from "../../src";
import {
  RFC7515_A1_JWK,
  RFC7515_A2_JWK,
  RFC7515_A2_TOKEN,
  RFC7515_A3_JWK,
  RFC7515_A3_TOKEN,
} from "./fixtures/rfc-vectors";
import { failure, segmentOf } from "./support";

const valueOf = <T>(result: JwtResult<T>): T => {
  if (!result.ok) {
    throw new Error(`expected ok, got ${JSON.stringify(result.error.issues)}`);
  }
  return result.value;
};

const bytesOf = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);
const PRIVATE_MEMBERS = new Set(["d", "p", "q", "dp", "dq", "qi"]);
const publicPart = (jwk: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(jwk).filter(([name]) => !PRIVATE_MEMBERS.has(name)));

// RFC 7515 Appendices A.6 and A.7 sign the payload of A.2 and A.3 with the same keys and signatures.
const [, RFC7515_PAYLOAD_SEGMENT, RFC7515_RS256_SIGNATURE] = RFC7515_A2_TOKEN.split(".") as [string, string, string];
const RFC7515_ES256_SIGNATURE = RFC7515_A3_TOKEN.split(".")[2] as string;
const RFC7515_PAYLOAD = Buffer.from(RFC7515_PAYLOAD_SEGMENT, "base64url");
const RSA_KID = "2010-12-29";
const EC_KID = "e9bc097a-ce51-4036-9562-d2ade882db0d";

/** RFC 7515 Appendix A.6.4: the general JWS JSON serialization, with display line breaks removed. */
const RFC7515_A6 = JSON.stringify({
  payload: RFC7515_PAYLOAD_SEGMENT,
  signatures: [
    { protected: "eyJhbGciOiJSUzI1NiJ9", header: { kid: RSA_KID }, signature: RFC7515_RS256_SIGNATURE },
    { protected: "eyJhbGciOiJFUzI1NiJ9", header: { kid: EC_KID }, signature: RFC7515_ES256_SIGNATURE },
  ],
});

/** RFC 7515 Appendix A.7: the flattened JWS JSON serialization of A.6's second signature. */
const RFC7515_A7 = JSON.stringify({
  payload: RFC7515_PAYLOAD_SEGMENT,
  protected: "eyJhbGciOiJFUzI1NiJ9",
  header: { kid: EC_KID },
  signature: RFC7515_ES256_SIGNATURE,
});

/** RFC 7797 §4.1: the payload `$.02`, base64url-encoded, signed with the RFC 7515 A.1 HMAC key. */
const RFC7797_ENCODED = "eyJhbGciOiJIUzI1NiJ9.JC4wMg.5mvfOroL-g7HyqJoozehmsaqmvTYGEq5jTI1gVvoEoQ";
/** RFC 7797 §4.2: the protected header `{"alg":"HS256","b64":false,"crit":["b64"]}`. */
const RFC7797_PROTECTED = "eyJhbGciOiJIUzI1NiIsImI2NCI6ZmFsc2UsImNyaXQiOlsiYjY0Il19";
const RFC7797_UNENCODED_SIGNATURE = "A5dxf2s96_n5FLueVuW1Z_vh161FwXZC4YLPff6dmDY";
/** RFC 7797 §4.2: the unencoded payload `$.02`, detached, in the compact serialization. */
const RFC7797_DETACHED = `${RFC7797_PROTECTED}..${RFC7797_UNENCODED_SIGNATURE}`;
/** RFC 7797 §4.2: the unencoded payload `$.02` in the flattened JSON serialization. */
const RFC7797_FLATTENED = JSON.stringify({
  protected: RFC7797_PROTECTED,
  payload: "$.02",
  signature: RFC7797_UNENCODED_SIGNATURE,
});

let hmac: SecretKey;
let rsaPrivate: SigningKey;
let rsaPublic: VerificationKey;
let ecPublic: VerificationKey;

beforeAll(async () => {
  hmac = valueOf(await importSecretKey(RFC7515_A1_JWK, { alg: "HS256" }));
  rsaPrivate = valueOf(await importPrivateKey(RFC7515_A2_JWK, { alg: "RS256", kid: RSA_KID }));
  rsaPublic = valueOf(await importPublicKey(publicPart(RFC7515_A2_JWK), { alg: "RS256", kid: RSA_KID }));
  ecPublic = valueOf(await importPublicKey(publicPart(RFC7515_A3_JWK), { alg: "ES256", kid: EC_KID }));
});

describe("RFC 7515 JSON serialization vectors", () => {
  it("should verify the A.6 general JWS by its RS256 signature", async () => {
    const verify = createJwsVerifier({ keys: createKeySet([rsaPublic, ecPublic]) });

    expect(valueOf(await verify(RFC7515_A6))).toEqual({
      payload: new Uint8Array(RFC7515_PAYLOAD),
      header: { alg: "RS256" },
      unprotectedHeader: { kid: RSA_KID },
      key: rsaPublic,
      signatureIndex: 0,
    });
  });

  it("should verify the A.6 general JWS by its ES256 signature when only that key is known", async () => {
    const verify = createJwsVerifier({ keys: createKeySet([ecPublic]) });

    const verified = valueOf(await verify(RFC7515_A6));

    expect([verified.signatureIndex, verified.key, verified.header]).toEqual([1, ecPublic, { alg: "ES256" }]);
  });

  it("should verify the A.7 flattened JWS", async () => {
    const verify = createJwsVerifier({ keys: createKeySet([ecPublic]) });

    expect(valueOf(await verify(RFC7515_A7)).payload).toEqual(new Uint8Array(RFC7515_PAYLOAD));
  });

  it("should reproduce A.6's RS256 signature, its kid unprotected", async () => {
    const jws = await signGeneralJws({
      payload: RFC7515_PAYLOAD,
      signers: [{ key: rsaPrivate, unprotectedHeader: { kid: RSA_KID } }],
    });

    expect(jws).toBe(
      JSON.stringify({
        payload: RFC7515_PAYLOAD_SEGMENT,
        signatures: [
          { protected: "eyJhbGciOiJSUzI1NiJ9", header: { kid: RSA_KID }, signature: RFC7515_RS256_SIGNATURE },
        ],
      }),
    );
  });

  it("should fail A.6 with every signature's issue for a key set that knows neither kid", async () => {
    const verify = createJwsVerifier({ keys: createKeySet([hmac]) });

    expect(await verify(RFC7515_A6)).toEqual(
      failure(
        { code: "unknown_kid", path: ["signatures", 0, "header", "kid"] },
        { code: "unknown_kid", path: ["signatures", 1, "header", "kid"] },
      ),
    );
  });
});

describe("RFC 7797 unencoded payload vectors", () => {
  const verifier = () => createJwsVerifier({ keys: createKeySet([hmac]) });

  it("should verify the §4.1 encoded payload and reproduce it", async () => {
    expect(valueOf(await verifier()(RFC7797_ENCODED)).payload).toEqual(bytesOf("$.02"));
    expect(await signJws({ payload: "$.02", key: hmac })).toBe(RFC7797_ENCODED);
  });

  it("should verify the §4.2 detached compact JWS with its payload and reproduce it", async () => {
    const verified = valueOf(await verifier()(RFC7797_DETACHED, { payload: "$.02" }));

    expect([verified.payload, verified.header]).toEqual([bytesOf("$.02"), { alg: "HS256", b64: false, crit: ["b64"] }]);
    expect(await signJws({ payload: "$.02", key: hmac, b64: false, detached: true })).toBe(RFC7797_DETACHED);
  });

  it("should verify the §4.2 flattened JWS and reproduce it", async () => {
    expect(valueOf(await verifier()(RFC7797_FLATTENED)).payload).toEqual(bytesOf("$.02"));
    expect(JSON.parse(await signJws({ payload: "$.02", key: hmac, b64: false, serialization: "flattened" }))).toEqual(
      JSON.parse(RFC7797_FLATTENED),
    );
  });

  it("should fail the §4.2 signature checked as an encoded payload", async () => {
    const relabelled = `${segmentOf('{"alg":"HS256"}')}..${RFC7797_UNENCODED_SIGNATURE}`;

    expect(await verifier()(relabelled, { payload: "$.02" })).toEqual(failure({ code: "bad_signature" }));
  });

  it("should fail the §4.2 detached JWS without its payload as a wrong one", async () => {
    expect(await verifier()(RFC7797_DETACHED)).toEqual(failure({ code: "bad_signature" }));
  });
});

const ASYMMETRIC = ["ES256", "EdDSA", "RS256"] as const satisfies readonly AsymmetricAlgorithm[];

describe.each(ASYMMETRIC)("jose interop for %s JWS", (alg) => {
  let josePrivate: CryptoKey;
  let josePublic: CryptoKey;
  let privateKey: SigningKey;
  let publicKey: VerificationKey;

  beforeAll(async () => {
    const pair = await jose.generateKeyPair(alg, { extractable: true });
    ({ privateKey: josePrivate, publicKey: josePublic } = pair);
    privateKey = valueOf(await importPrivateKey(await jose.exportJWK(josePrivate), { alg, kid: "k" }));
    publicKey = valueOf(await importPublicKey(await jose.exportJWK(josePublic), { alg, kid: "k" }));
  });

  const payload = bytesOf('{"amount":"$.02"}');

  it("should verify a flattened unencoded JWS jose signed", async () => {
    const jws = await new jose.FlattenedSign(payload)
      .setProtectedHeader({ alg, b64: false, crit: ["b64"] })
      .setUnprotectedHeader({ kid: "k" })
      .sign(josePrivate);

    // jose writes an unencoded JSON payload as "", which detaches it, so it is given back here.
    const verify = createJwsVerifier({ keys: createKeySet([publicKey]) });
    const verified = valueOf(await verify(JSON.stringify(jws), { payload }));

    expect([verified.payload, verified.unprotectedHeader]).toEqual([payload, { kid: "k" }]);
  });

  it("should verify a general JWS jose signed", async () => {
    const jws = await new jose.GeneralSign(payload)
      .addSignature(josePrivate)
      .setProtectedHeader({ alg, kid: "k" })
      .sign();

    expect(valueOf(await createJwsVerifier({ keys: createKeySet([publicKey]) })(JSON.stringify(jws))).payload).toEqual(
      payload,
    );
  });

  it("should produce a flattened unencoded JWS jose verifies", async () => {
    const jws = await signJws({ payload, key: privateKey, b64: false, serialization: "flattened" });

    const verified = await jose.flattenedVerify(JSON.parse(jws) as jose.FlattenedJWS, josePublic);

    expect([verified.payload, verified.protectedHeader]).toEqual([
      payload,
      { alg, kid: "k", b64: false, crit: ["b64"] },
    ]);
  });

  it("should produce a detached flattened JWS jose verifies with its payload", async () => {
    const jws = JSON.parse(await signJws({ payload, key: privateKey, detached: true, serialization: "flattened" })) as {
      protected: string;
      signature: string;
    };

    const verified = await jose.flattenedVerify(
      { ...jws, payload: Buffer.from(payload).toString("base64url") },
      josePublic,
    );

    expect(verified.payload).toEqual(payload);
  });

  it("should produce a general JWS jose verifies", async () => {
    const jws = await signGeneralJws({ payload, signers: [{ key: privateKey }] });

    expect((await jose.generalVerify(JSON.parse(jws) as jose.GeneralJWS, josePublic)).payload).toEqual(payload);
  });
});

describe("hostile JWS input", () => {
  const verifier = () => createJwsVerifier({ keys: createKeySet([hmac]) });
  const protectedHs = segmentOf('{"alg":"HS256"}');

  it.each([
    [
      "an unprotected alg",
      { payload: "YQ", protected: segmentOf("{}"), header: { alg: "HS256" }, signature: "AAAA" },
      ["header", "alg"],
    ],
    [
      "a member in both headers",
      { payload: "YQ", protected: segmentOf('{"alg":"HS256","typ":"a"}'), header: { typ: "a" }, signature: "AAAA" },
      ["header"],
    ],
    [
      "b64 outside crit",
      { payload: "a", protected: segmentOf('{"alg":"HS256","b64":false}'), signature: "AAAA" },
      ["header", "b64"],
    ],
    [
      "an unprotected b64",
      { payload: "a", protected: protectedHs, header: { b64: false }, signature: "AAAA" },
      ["header", "b64"],
    ],
  ])("should refuse %s as malformed", async (_, value, path) => {
    expect(await verifier()(JSON.stringify(value))).toEqual(failure({ code: "malformed", path }));
  });

  it("should refuse more than 8 signatures", async () => {
    const entry = { protected: protectedHs, signature: "AAAA" };

    expect(
      await verifier()(JSON.stringify({ payload: "YQ", signatures: Array.from({ length: 9 }, () => entry) })),
    ).toEqual(failure({ code: "too_large", path: ["signatures"], params: { limit: "signatures", maximum: 8 } }));
  });

  it("should refuse JSON nested deeper than 32 levels", async () => {
    const jws = `{"payload":"YQ","extra":${"[".repeat(32)}${"]".repeat(32)},"protected":"${protectedHs}","signature":"AAAA"}`;

    expect(await verifier()(jws)).toEqual(failure({ code: "too_large", params: { limit: "depth", maximum: 32 } }));
  });

  it("should refuse a huge JSON JWS before parsing it", async () => {
    const jws = JSON.stringify({ payload: "Y".repeat(70_000), protected: protectedHs, signature: "AAAA" });

    expect(await verifier()(jws)).toEqual(failure({ code: "too_large", params: { limit: "length", maximum: 8192 } }));
  });

  it("should refuse a JWS that is a parsed object rather than text", async () => {
    expect(await verifier()(JSON.parse(RFC7797_FLATTENED))).toEqual(failure({ code: "malformed" }));
  });

  it("should accept a detached payload from another realm", async () => {
    const payload = runInNewContext("new Uint8Array([36, 46, 48, 50])") as Uint8Array;

    expect((await verifier()(RFC7797_DETACHED, { payload })).ok).toBe(true);
  });

  it("should refuse a signer header that is a class instance", async () => {
    class Header {
      typ = "a";
    }

    await expect(signJws({ payload: "a", key: hmac, header: new Header() as never })).rejects.toThrow(TypeError);
  });

  it("should sign signers from another realm's array", async () => {
    const signers = runInNewContext("[]") as unknown[];
    signers.push({ key: hmac });

    expect(
      valueOf(await verifier()(await signGeneralJws({ payload: "a", signers: signers as never }))).signatureIndex,
    ).toBe(0);
  });
});
