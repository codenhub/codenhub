import { runInNewContext } from "node:vm";

import { beforeAll, describe, expect, expectTypeOf, it, vi } from "vitest";

import { fail } from "../core/result";
import type {
  AsymmetricAlgorithm,
  JwtPayload,
  JwtResult,
  KeySet,
  SecretKey,
  VerifiedJwt,
  Verifier,
} from "../core/types";
import { decodeBase64Url, encodeBase64Url } from "../encoding/base64url";
import type { StandardSchemaV1 } from "../interop/standard-schema";
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
    const payload = { sub: "user-1", exp: NOW_SECONDS + 60, roles: ["admin"], profile: { name: "n" } };
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

describe("createVerifier payload and clock", () => {
  it("should keep __proto__ as an own payload key from sign to verify", async () => {
    const payload = JSON.parse('{"__proto__":{"admin":true},"sub":"u","exp":1800000060}') as Record<string, unknown>;
    const result = await verifierFor(keySetOf(secretKey))(await sign({ payload, key: secretKey }));

    const verified = valueOf(result).payload;
    expect([Object.hasOwn(verified, "__proto__"), Object.getPrototypeOf(verified) === Object.prototype]).toEqual([
      true,
      true,
    ]);
    expect(Object.getOwnPropertyDescriptor(verified, "__proto__")?.value).toEqual({ admin: true });
  });

  it("should use the real time when now is not given", async () => {
    const seconds = Math.floor(Date.now() / 1000);
    const verify = createVerifier({ keys: keySetOf(secretKey) });
    const [fresh, stale] = await Promise.all(
      [seconds + 3600, seconds - 3600].map((exp) => sign({ payload: { exp }, key: secretKey })),
    );

    expect([(await verify(fresh as string)).ok, (await verify(stale as string)).ok]).toEqual([true, false]);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, undefined, null, "1800000000000", 1n])(
    "should reject with TypeError when now returns %s, instead of skipping every time check",
    async (time) => {
      const verify = createVerifier({ keys: keySetOf(secretKey), now: () => time as number });
      const token = await sign({ payload: { exp: 1 }, key: secretKey });

      await expect(verify(token)).rejects.toThrow(
        new TypeError("createVerifier: options.now must return a finite number of milliseconds."),
      );
    },
  );

  it("should read the clock once per verification", async () => {
    let reads = 0;
    const verify = createVerifier({
      keys: keySetOf(secretKey),
      now: () => {
        reads += 1;
        return clockAt()();
      },
    });
    await verify(await sign({ payload: PAYLOAD, key: secretKey }));

    expect(reads).toBe(1);
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
    ["returns a failure whose issue is a string", async () => ({ ok: false, error: { issues: ["unknown_kid"] } })],
    ["returns a failure whose issue is null", async () => ({ ok: false, error: { issues: [null] } })],
    ["returns a failure whose issue has no code", async () => ({ ok: false, error: { issues: [{ path: [] }] } })],
    ["returns a failure whose issue code is a number", async () => ({ ok: false, error: { issues: [{ code: 1 }] } })],
    [
      "returns a failure with one good and one malformed issue",
      async () => ({ ok: false, error: { issues: [{ code: "unknown_kid" }, {}] } }),
    ],
    [
      "returns a failure whose issue code getter throws",
      async () => ({
        ok: false,
        error: {
          issues: [
            {
              get code() {
                throw new Error("boom");
              },
            },
          ],
        },
      }),
    ],
    [
      "returns a failure whose issue is a throwing Proxy",
      async () => ({
        ok: false,
        error: {
          issues: [
            new Proxy(
              {},
              {
                getOwnPropertyDescriptor() {
                  throw new Error("boom");
                },
              },
            ),
          ],
        },
      }),
    ],
    [
      "returns a failure whose issues have a hole",
      // eslint-disable-next-line no-sparse-arrays -- the hole is the case under test.
      async () => ({ ok: false, error: { issues: [{ code: "unknown_kid" }, , { code: "unknown_kid" }] } }),
    ],
    [
      "returns a failure whose issues are only holes",
      async () => ({ ok: false, error: { issues: Object.assign([], { length: 1 }) } }),
    ],
    [
      "returns a result whose ok getter throws",
      async () => ({
        get ok() {
          throw new Error("boom");
        },
      }),
    ],
    [
      "returns a failure whose issue path is a string",
      async () => ({ ok: false, error: { issues: [{ code: "tenant_unknown", path: "tenant" }] } }),
    ],
    [
      "returns a failure whose issue path is a number",
      async () => ({ ok: false, error: { issues: [{ code: "tenant_unknown", path: 0 }] } }),
    ],
    [
      "returns a failure whose issue path holds an object",
      async () => ({ ok: false, error: { issues: [{ code: "tenant_unknown", path: ["tenant", {}] }] } }),
    ],
    [
      "returns a failure whose issue path holds NaN",
      async () => ({ ok: false, error: { issues: [{ code: "tenant_unknown", path: [Number.NaN] }] } }),
    ],
    [
      "returns a failure whose issue path is a getter",
      async () => ({
        ok: false,
        error: {
          issues: [
            {
              code: "tenant_unknown",
              get path() {
                return ["tenant"];
              },
            },
          ],
        },
      }),
    ],
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

  it("should pass through a failure whose issues all have a string code", async () => {
    const keys = {
      select: async () => ({ ok: false, error: { issues: [{ code: "unknown_kid" }, { code: "no_matching_key" }] } }),
    } as unknown as KeySet;
    const token = await sign({ payload: {}, key: secretKey });

    expect(await verifierFor(keys)(token)).toEqual(failure({ code: "unknown_kid" }, { code: "no_matching_key" }));
  });

  it("should pass through an issue whose path is an array of strings and numbers", async () => {
    const keys = {
      select: async () => ({ ok: false, error: { issues: [{ code: "tenant_unknown", path: ["tenants", 2] }] } }),
    } as unknown as KeySet;
    const token = await sign({ payload: {}, key: secretKey });

    expect(await verifierFor(keys)(token)).toEqual(failure({ code: "tenant_unknown" as never, path: ["tenants", 2] }));
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

describe("createVerifier onKeySetError", () => {
  const KEY_SET_ERROR = failure({ code: "key_fetch_failed", params: { reason: "key_set_error" } });
  const tokenFor = async () => sign({ payload: PAYLOAD, key: pairs.ES256.privateKey });

  it("should hand what a key set throws to onKeySetError, keeping it out of the result", async () => {
    const thrown = new Error("database unreachable");
    const errors: unknown[] = [];
    const keys: KeySet = {
      select: async () => {
        throw thrown;
      },
    };
    const verify = createVerifier({ keys, now: clockAt(), onKeySetError: (error) => errors.push(error) });
    expect([await verify(await tokenFor()), errors]).toEqual([KEY_SET_ERROR, [thrown]]);
  });

  it("should hand a TypeError naming the mistake when a key set returns something other than a result", async () => {
    const errors: unknown[] = [];
    const keys = { select: async () => "not a result" } as unknown as KeySet;
    const verify = createVerifier({ keys, now: clockAt(), onKeySetError: (error) => errors.push(error) });
    expect(await verify(await tokenFor())).toEqual(KEY_SET_ERROR);
    expect(errors).toEqual([new TypeError("The key set's select returned something other than a result.")]);
  });

  it.each([
    [
      "throws",
      () => {
        throw new Error("logger broke");
      },
    ],
    ["rejects", async () => Promise.reject(new Error("logger broke"))],
  ])("should return the same failure when onKeySetError %s", async (_name, onKeySetError) => {
    const keys = { select: async () => null } as unknown as KeySet;
    const verify = createVerifier({ keys, now: clockAt(), onKeySetError });
    expect(await verify(await tokenFor())).toEqual(KEY_SET_ERROR);
  });

  it.each([
    ["a promise from another realm that rejects", () => runInNewContext("(async () => { throw new Error('x') })")()],
    [
      "a thenable whose then getter throws",
      () => ({
        // oxlint-disable-next-line unicorn/no-thenable -- the case under test is a hostile thenable.
        get then() {
          throw new Error("x");
        },
      }),
    ],
    [
      "a thenable whose then throws",
      () => ({
        // oxlint-disable-next-line unicorn/no-thenable -- the case under test is a hostile thenable.
        then() {
          throw new Error("x");
        },
      }),
    ],
  ])("should leave no unhandled rejection when onKeySetError returns %s", async (_name, onKeySetError) => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const keys = { select: async () => null } as unknown as KeySet;
      const verify = createVerifier({ keys, now: clockAt(), onKeySetError });
      expect(await verify(await tokenFor())).toEqual(KEY_SET_ERROR);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("should not call onKeySetError for a key set's own failure", async () => {
    const errors: unknown[] = [];
    const keys: KeySet = { select: async () => fail({ code: "unknown_kid", path: ["header", "kid"] }) };
    const verify = createVerifier({ keys, now: clockAt(), onKeySetError: (error) => errors.push(error) });
    await verify(await tokenFor());
    expect(errors).toEqual([]);
  });

  it("should throw TypeError when onKeySetError is not a function", () => {
    expect(() => createVerifier({ keys: keySetOf(pairs.ES256.publicKey), onKeySetError: "log" as never })).toThrow(
      new TypeError("createVerifier: options.onKeySetError must be a function."),
    );
  });
});

describe("createVerifier payload types", () => {
  // Checked by `pnpm typecheck`; each verifier also runs, so the types describe what it returns.
  interface AccessClaims {
    sub: string;
    tenant: string;
    roles: string[];
  }
  const tenantSchema: StandardSchemaV1<{ tenant: string }> = {
    "~standard": { version: 1, vendor: "test", validate: (value) => ({ value: value as { tenant: string } }) },
  };

  it("should type the payload by an interface given as the type argument", async () => {
    const verify = createVerifier<AccessClaims>({ keys: keySetOf(secretKey), now: clockAt() });
    const result = await verify(await sign({ payload: { ...PAYLOAD, tenant: "t1", roles: [] }, key: secretKey }));

    expectTypeOf(verify).toEqualTypeOf<Verifier<AccessClaims>>();
    expect(result.ok && result.value.payload.tenant).toBe("t1");
  });

  it("should infer the payload from a claims schema", () => {
    const verify = createVerifier({ keys: keySetOf(secretKey), claims: tenantSchema });

    expectTypeOf(verify).toEqualTypeOf<Verifier<JwtPayload & { tenant: string }>>();
  });

  it("should type the payload as JwtPayload without a schema or a type argument", () => {
    expectTypeOf(createVerifier({ keys: keySetOf(secretKey) })).toEqualTypeOf<Verifier<JwtPayload>>();
  });

  it("should accept an interface payload in VerifiedJwt and Verifier", () => {
    expectTypeOf<VerifiedJwt<AccessClaims>["payload"]>().toEqualTypeOf<AccessClaims>();
    expectTypeOf<Verifier<AccessClaims>>().returns.resolves.toEqualTypeOf<JwtResult<VerifiedJwt<AccessClaims>>>();
  });

  it("should accept an interface with only custom claims", () => {
    interface TenantClaims {
      tenant: string;
    }

    expectTypeOf(createVerifier<TenantClaims>({ keys: keySetOf(secretKey) })).toEqualTypeOf<Verifier<TenantClaims>>();
    expectTypeOf<VerifiedJwt<TenantClaims>["payload"]>().toEqualTypeOf<TenantClaims>();
  });

  it("should refuse a type argument whose registered claims have the wrong type", () => {
    // @ts-expect-error exp is a number of seconds.
    expect(typeof createVerifier<{ exp: string }>({ keys: keySetOf(secretKey) })).toBe("function");
  });
});
