import { inspect } from "node:util";

import { beforeAll, describe, expect, it } from "vitest";

import {
  createKeySet,
  createRemoteKeySet,
  createVerifier,
  exportPrivateJwk,
  exportSecretJwk,
  generateKeyPair,
  importKeySet,
  importPrivateKey,
  importPublicKey,
  importSecretKey,
  readHeader,
  sign,
  type KeyPair,
  type SecretKey,
  type StandardSchemaV1,
} from "../../src";
import { RFC7515_A2_JWK, RFC7515_A3_JWK, RFC8037_PRIVATE_JWK } from "./fixtures/rfc-vectors";
import { base64Url, forge, segmentOf } from "./support";

// Every input below carries this marker in each field an attacker controls. No result, issue, or error
// message may contain it, nor its base64url forms, which a careless issue could echo as a segment.
const MARKER = "LEAKMARKERq7Zx";
const MARKERS = [MARKER, segmentOf(MARKER), segmentOf(` ${MARKER}`), segmentOf(`  ${MARKER}`)];

const leaked = (text: string): string[] => MARKERS.filter((marker) => text.includes(marker));

/** Every marker found in the JSON form of `value`. */
const leakedBy = (value: unknown): string[] => leaked(JSON.stringify(value) ?? "");

/** Every marker found in the message of what `run` throws, or a note that it did not throw. */
const leakedByThrow = (run: () => unknown): string[] => {
  try {
    run();
  } catch (error) {
    return error instanceof TypeError ? leaked(error.message) : [`not a TypeError: ${String(error)}`];
  }
  return ["did not throw"];
};

const leakedByRejection = async (run: () => Promise<unknown>): Promise<string[]> => {
  try {
    await run();
  } catch (error) {
    return error instanceof TypeError ? leaked(error.message) : [`not a TypeError: ${String(error)}`];
  }
  return ["did not reject"];
};

const NOW_SECONDS = 1_800_000_000;
const now = () => NOW_SECONDS * 1000;

let pair: KeyPair;
let secretKey: SecretKey;
const secretBytes = crypto.getRandomValues(new Uint8Array(32));
let privateJwk: JsonWebKey;

beforeAll(async () => {
  pair = await generateKeyPair({ alg: "ES256", kid: "es", extractable: true });
  privateJwk = { ...(await exportPrivateJwk(pair.privateKey)) } as JsonWebKey;
  const imported = await importSecretKey(secretBytes, { alg: "HS256", kid: "hs" });
  if (!imported.ok) {
    throw new Error("secret import failed");
  }
  secretKey = imported.value;
});

const hmacToken = (header: string, payload: string) => forge("HS256", secretBytes, header, payload);

/** A schema whose every issue quotes the input, as many validators' messages do. */
const quotingSchema: StandardSchemaV1<Record<string, unknown>> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (value) => ({
      issues: [{ message: `bad value ${JSON.stringify(value)}`, path: [{ key: "role" }] }],
    }),
  },
};

describe("token failures carry no input", () => {
  const strictVerifier = () =>
    createVerifier({
      keys: createKeySet([secretKey, pair.publicKey]),
      issuer: "https://issuer.example",
      audience: "app",
      type: "at+jwt",
      maxAge: 60,
      requiredClaims: ["sub", "tenant"],
      now,
    });

  const corpus: [string, () => Promise<string> | string][] = [
    [
      "an alg named after the marker",
      () => `${segmentOf(`{"alg":"${MARKER}"}`)}.${segmentOf("{}")}.${segmentOf(MARKER)}`,
    ],
    ["a marker kid unknown to the key set", () => hmacToken(`{"alg":"HS256","kid":"${MARKER}"}`, "{}")],
    ["a marker in crit", () => hmacToken(`{"alg":"HS256","crit":["${MARKER}"]}`, "{}")],
    ["a duplicate marker header member", () => hmacToken(`{"alg":"HS256","${MARKER}":1,"${MARKER}":2}`, "{}")],
    ["a duplicate marker payload member", () => hmacToken('{"alg":"HS256"}', `{"${MARKER}":1,"${MARKER}":2}`)],
    ["a marker payload that is not JSON", () => hmacToken('{"alg":"HS256"}', MARKER)],
    ["a marker kid that is not text", () => hmacToken(`{"alg":"HS256","kid":["${MARKER}"]}`, "{}")],
    ["a marker typ that is not text", () => hmacToken(`{"alg":"HS256","typ":{"${MARKER}":1}}`, "{}")],
    [
      "a bad signature over marker claims",
      async () => `${(await hmacToken('{"alg":"HS256"}', `{"sub":"${MARKER}"}`)).slice(0, -4)}AAAA`,
    ],
    ["a marker as the signature", () => `${segmentOf('{"alg":"HS256"}')}.${segmentOf("{}")}.${segmentOf(MARKER)}`],
    ["marker text in every segment", () => `${segmentOf(MARKER)}.${segmentOf(MARKER)}.${segmentOf(MARKER)}`],
    ["padding after a marker segment", () => `${segmentOf(`{"alg":"HS256","kid":"${MARKER}"}`)}==.e30.AAAA`],
    ["too long, full of markers", () => MARKER.repeat(1000)],
    [
      "marker claims failing every claim check",
      () =>
        hmacToken(
          `{"alg":"HS256","typ":"${MARKER}"}`,
          JSON.stringify({
            iss: MARKER,
            aud: [MARKER, `${MARKER}2`],
            sub: MARKER,
            exp: NOW_SECONDS - 1,
            nbf: NOW_SECONDS + 1,
            iat: NOW_SECONDS - 3600,
            [MARKER]: MARKER,
          }),
        ),
    ],
    [
      "marker values in ill-typed registered claims",
      () =>
        hmacToken(
          '{"alg":"HS256","typ":"at+jwt"}',
          JSON.stringify({
            iss: [MARKER],
            aud: { [MARKER]: 1 },
            sub: 1,
            exp: MARKER,
            nbf: MARKER,
            iat: MARKER,
            jti: [MARKER],
          }),
        ),
    ],
    [
      "an ES256 token relabelled HS256 with a marker kid",
      () => forge("ES256", privateJwk, `{"alg":"HS256","kid":"es","x":"${MARKER}"}`, `{"sub":"${MARKER}"}`),
    ],
  ];

  it.each(corpus)("should not echo the marker for %s", async (_, build) => {
    const result = await strictVerifier()(await build());

    expect([result.ok, leakedBy(result)]).toEqual([false, []]);
  });

  // readHeader succeeds for a well-formed header, and then rightly returns its kid; only failures are checked.
  it.each(corpus)("should not echo the marker in a readHeader failure for %s", async (_, build) => {
    const result = readHeader(await build());

    expect(result.ok ? [] : leakedBy(result)).toEqual([]);
  });

  it("should drop the messages of schema issues that quote the payload", async () => {
    const verify = createVerifier({ keys: createKeySet([secretKey]), claims: quotingSchema, now });
    const result = await verify(await hmacToken('{"alg":"HS256"}', `{"role":"${MARKER}"}`));

    expect(result).toEqual({ ok: false, error: { issues: [{ code: "invalid_claims", path: ["payload", "role"] }] } });
  });
});

describe("key import failures carry no input", () => {
  const ecJwk = { ...RFC7515_A3_JWK, kid: MARKER };
  const rsaJwk = { ...RFC7515_A2_JWK, kid: MARKER };
  const okpJwk = { ...RFC8037_PRIVATE_JWK, kid: MARKER };

  const publicCorpus: [string, unknown][] = [
    ["a marker string", MARKER],
    ["an unknown marker kty", { kty: MARKER, kid: MARKER }],
    ["a marker crv", { kty: "EC", crv: MARKER, x: MARKER, y: MARKER }],
    ["marker coordinates", { kty: "EC", crv: "P-256", x: segmentOf(MARKER), y: segmentOf(MARKER), kid: MARKER }],
    ["a marker alg", { ...ecJwk, d: undefined, alg: MARKER }],
    ["a marker use", { ...ecJwk, d: undefined, use: MARKER }],
    ["marker key_ops", { ...ecJwk, d: undefined, key_ops: [MARKER] }],
    ["private EC material", ecJwk],
    ["private RSA material", rsaJwk],
    ["private OKP material", okpJwk],
    ["a weak RSA modulus", { kty: "RSA", n: segmentOf(MARKER.repeat(4)), e: "AQAB", kid: MARKER }],
    ["a kid that is not text", { ...ecJwk, d: undefined, kid: [MARKER] }],
  ];

  it.each(publicCorpus)("should not echo the marker importing %s as a public key", async (_, jwk) => {
    const result = await importPublicKey(jwk, { alg: "ES256" });

    expect([result.ok, leakedBy(result)]).toEqual([false, []]);
  });

  it.each([
    ["EC material with a marker d", { ...RFC7515_A3_JWK, d: segmentOf(`${MARKER}${MARKER}xx`), kid: MARKER }, "ES256"],
    ["RSA material without CRT members", { ...RFC7515_A2_JWK, p: undefined, kid: MARKER }, "RS256"],
    ["OKP material with a marker d", { ...RFC8037_PRIVATE_JWK, d: segmentOf(MARKER) }, "EdDSA"],
  ] as const)("should not echo the marker importing %s as a private key", async (_, jwk, alg) => {
    const result = await importPrivateKey(jwk, { alg });

    expect([result.ok, leakedBy(result)]).toEqual([false, []]);
  });

  it.each([
    ["short secret bytes", new TextEncoder().encode(MARKER)],
    ["a short oct JWK", { kty: "oct", k: segmentOf(MARKER), kid: MARKER }],
    ["an oct JWK with a marker alg", { kty: "oct", k: segmentOf(MARKER.repeat(3)), alg: MARKER }],
  ])("should not echo the marker importing %s as a secret key", async (_, input) => {
    const result = await importSecretKey(input, { alg: "HS256" });

    expect([result.ok, leakedBy(result)]).toEqual([false, []]);
  });

  it("should not echo the marker importing a JWKS of failing marker keys", async () => {
    const result = await importKeySet({ keys: publicCorpus.map(([, jwk]) => jwk) });
    const header = { alg: "ES256", kid: MARKER } as const;

    expect(result.ok && leakedBy(await result.value.select(header))).toEqual([]);
  });

  it("should not echo the marker for a JWKS that is not one", async () => {
    expect(leakedBy(await importKeySet({ [MARKER]: [MARKER] }))).toEqual([]);
  });
});

describe("remote JWKS failures carry no input", () => {
  const select = (response: () => Response) =>
    createRemoteKeySet({
      url: "https://issuer.example/jwks.json",
      fetch: async () => response(),
      now,
    }).select({ alg: "ES256", kid: MARKER });

  it.each([
    ["an error status with a marker body", () => new Response(MARKER, { status: 500, statusText: MARKER })],
    ["a marker body that is not JSON", () => new Response(MARKER, { status: 200 })],
    ["marker duplicate members", () => new Response(`{"keys":[],"${MARKER}":1,"${MARKER}":2}`, { status: 200 })],
    ["a marker JSON that is not a JWKS", () => new Response(JSON.stringify({ [MARKER]: MARKER }), { status: 200 })],
    ["a marker body over the size cap", () => new Response(MARKER.repeat(10_000), { status: 200 })],
    [
      "a redirect to a marker location",
      () => new Response(null, { status: 302, headers: { location: `https://${MARKER}.example/` } }),
    ],
    [
      "a JWKS of failing marker keys",
      () => new Response(JSON.stringify({ keys: [{ kty: MARKER, kid: MARKER }] }), { status: 200 }),
    ],
  ])("should not echo the marker for %s", async (_, response) => {
    const result = await select(response);

    expect([result.ok, leakedBy(result)]).toEqual([false, []]);
  });

  it("should not echo the marker of a fetch that rejects with it", async () => {
    const result = await createRemoteKeySet({
      url: "https://issuer.example/jwks.json",
      fetch: async () => {
        throw new Error(MARKER);
      },
      now,
    }).select({ alg: "ES256" });

    expect([result.ok, leakedBy(result)]).toEqual([false, []]);
  });
});

describe("programmer errors carry no values", () => {
  it.each([
    ["a marker issuer list entry that is not text", { issuer: [MARKER, 1] }],
    ["a marker clockTolerance", { clockTolerance: MARKER }],
    ["a marker maxAge", { maxAge: MARKER }],
    ["a marker maxLength", { maxLength: MARKER }],
    ["a marker type that is empty after its prefix", { type: 1, [MARKER]: MARKER }],
    ["marker requiredClaims that are not text", { requiredClaims: [MARKER, 1] }],
    ["a marker claims schema", { claims: { "~standard": MARKER } }],
    ["a marker now", { now: MARKER }],
  ])("should throw a TypeError without the marker from createVerifier for %s", (_, options) => {
    expect(leakedByThrow(() => createVerifier({ keys: createKeySet([secretKey]), ...options } as never))).toEqual([]);
  });

  it("should throw a TypeError without the marker from createVerifier for a marker key set", () => {
    expect(leakedByThrow(() => createVerifier({ keys: MARKER } as never))).toEqual([]);
  });

  it.each([
    ["an http marker URL", { url: `http://${MARKER}.example/jwks` }],
    ["a marker URL with credentials", { url: `https://${MARKER}:${MARKER}@issuer.example/jwks` }],
    ["a marker URL that does not parse", { url: `${MARKER} not a url` }],
    ["a marker cacheTtl", { url: "https://issuer.example/jwks", cacheTtl: MARKER }],
    ["a marker algorithm", { url: "https://issuer.example/jwks", algorithms: [MARKER] }],
  ])("should throw a TypeError without the marker from createRemoteKeySet for %s", (_, options) => {
    expect(leakedByThrow(() => createRemoteKeySet(options as never))).toEqual([]);
  });

  it("should throw a TypeError without the marker from createKeySet for a forged key", () => {
    expect(leakedByThrow(() => createKeySet([{ kind: "public", alg: "ES256", kid: MARKER }] as never))).toEqual([]);
  });

  it.each([
    ["a marker exp", { exp: MARKER }],
    ["a marker aud list entry that is not text", { aud: [MARKER, 1] }],
    ["a marker iss that is not text", { iss: [MARKER] }],
    ["a function under a marker name", { [MARKER]: () => MARKER }],
    ["a bigint under a marker name", { [MARKER]: 1n }],
    ["a non-finite number under a marker name", { [MARKER]: Number.POSITIVE_INFINITY }],
  ])("should reject sign with a TypeError without the marker for %s", async (_, payload) => {
    expect(await leakedByRejection(() => sign({ payload: payload as never, key: secretKey }))).toEqual([]);
  });

  it.each([
    ["a marker alg", { alg: MARKER }],
    ["a marker crit", { crit: [MARKER] }],
    ["a marker jku", { jku: `https://${MARKER}.example/` }],
    ["a kid that is not text", { kid: [MARKER] }],
  ])("should reject sign with a TypeError without the marker for a header with %s", async (_, header) => {
    expect(
      await leakedByRejection(() => sign({ payload: { sub: "user-1" }, key: secretKey, header: header as never })),
    ).toEqual([]);
  });

  it("should reject sign with a TypeError without the marker for a forged key", async () => {
    expect(
      await leakedByRejection(() =>
        sign({ payload: {}, key: { kind: "secret", alg: "HS256", kid: MARKER, extractable: true } as never }),
      ),
    ).toEqual([]);
  });
});

describe("keys carry no material", () => {
  it("should show only kind, alg, kid and extractable in a private key's JSON form", async () => {
    const result = await importPrivateKey(RFC8037_PRIVATE_JWK, { alg: "EdDSA" });

    expect(result.ok && JSON.parse(JSON.stringify(result.value))).toEqual({
      kind: "private",
      alg: "EdDSA",
      extractable: false,
    });
  });

  it("should show no private member in the inspected form of an RSA private key", async () => {
    const result = await importPrivateKey(RFC7515_A2_JWK, { alg: "RS256" });
    const inspected = result.ok ? inspect(result.value, { depth: 10, showHidden: true }) : "";

    expect(
      [RFC7515_A2_JWK.d, RFC7515_A2_JWK.p, RFC7515_A2_JWK.q, RFC7515_A2_JWK.n].filter((value) =>
        inspected.includes(value.slice(0, 16)),
      ),
    ).toEqual([]);
  });

  it("should hold no material in any own property of a secret key", () => {
    const own = Reflect.ownKeys(secretKey).map((name) => [String(name), typeof Reflect.get(secretKey, name)]);

    expect(own).toEqual([
      ["kind", "string"],
      ["alg", "string"],
      ["kid", "string"],
      ["extractable", "boolean"],
    ]);
  });

  it("should show no secret bytes in a secret key's JSON form", () => {
    expect(JSON.stringify(secretKey).includes(base64Url(secretBytes))).toBe(false);
  });

  it("should throw a TypeError without material when exporting a non-extractable secret", async () => {
    const error = await exportSecretJwk(secretKey).catch((caught: unknown) => caught);

    expect([error instanceof TypeError, String(error).includes(base64Url(secretBytes))]).toEqual([true, false]);
  });
});
