import { beforeAll, describe, expect, it, vi } from "vitest";

import type { JwtPayload, SecretKey, VerifierOptions } from "../core/types";
import type { StandardSchemaV1 } from "../interop/standard-schema";
import { generateSecretKey } from "../keys/generate";
import { sign, type SignHeader } from "../sign/sign";
import { createVerifier } from "./create-verifier";
import { clockAt, failure, keySetOf, NOW_SECONDS, signRaw } from "./test-support";

let key: SecretKey;

beforeAll(async () => {
  key = await generateSecretKey({ alg: "HS256" });
});

type ClaimOptions = Omit<VerifierOptions<StandardSchemaV1 | undefined>, "keys">;

/** Signs `payload` and verifies it at {@link NOW_SECONDS} plus `offsetSeconds`. */
async function verifyAt(
  offsetSeconds: number,
  payload: JwtPayload,
  options: ClaimOptions = {},
  header?: SignHeader,
): Promise<unknown> {
  const token = await sign({ payload, key, ...(header === undefined ? {} : { header }) });
  // Most checks here are not about exp, so the helper waives it; the "exp required" tests set it back.
  return createVerifier({ keys: keySetOf(key), now: clockAt(offsetSeconds), requireExpiration: false, ...options })(
    token,
  );
}

const verify = (payload: JwtPayload, options: ClaimOptions = {}, header?: SignHeader): Promise<unknown> =>
  verifyAt(0, payload, options, header);

const passed = (payload: JwtPayload, header: object = { alg: "HS256" }) => ({
  ok: true,
  value: { header, payload, key },
});

describe("exp", () => {
  it("should accept a token one second before exp", async () => {
    expect(await verifyAt(-1, { exp: NOW_SECONDS })).toEqual(passed({ exp: NOW_SECONDS }));
  });

  it("should reject a token at exactly exp", async () => {
    expect(await verify({ exp: NOW_SECONDS })).toEqual(failure({ code: "expired", path: ["payload", "exp"] }));
  });

  it("should reject a token half a second after exp", async () => {
    expect(await verifyAt(0.5, { exp: NOW_SECONDS })).toEqual(failure({ code: "expired", path: ["payload", "exp"] }));
  });

  it("should accept a token 29 seconds after exp with a tolerance of 30", async () => {
    expect(await verifyAt(29, { exp: NOW_SECONDS }, { clockTolerance: 30 })).toEqual(passed({ exp: NOW_SECONDS }));
  });

  it("should reject a token 30 seconds after exp with a tolerance of 30", async () => {
    expect(await verifyAt(30, { exp: NOW_SECONDS }, { clockTolerance: 30 })).toEqual(
      failure({ code: "expired", path: ["payload", "exp"] }),
    );
  });
});

// A token from a server whose clock runs ahead is in the future here from the moment it is signed, so nbf
// and iat get at least FUTURE_LEEWAY_SECONDS whatever clockTolerance says (scope.md decision 26).
describe.each([
  ["nbf", "not_yet_valid"],
  ["iat", "issued_in_future"],
] as const)("%s in the future", (claim, code) => {
  const rejected = failure({ code, path: ["payload", claim] });

  it("should accept a token at exactly the claim", async () => {
    expect(await verify({ [claim]: NOW_SECONDS })).toEqual(passed({ [claim]: NOW_SECONDS }));
  });

  it("should accept a claim a fraction of a second ahead, as a fast issuer clock makes it", async () => {
    expect(await verifyAt(-0.3, { [claim]: NOW_SECONDS })).toEqual(passed({ [claim]: NOW_SECONDS }));
  });

  it("should accept a claim 60 seconds ahead with the default tolerance of 0", async () => {
    expect(await verifyAt(-60, { [claim]: NOW_SECONDS })).toEqual(passed({ [claim]: NOW_SECONDS }));
  });

  it("should reject a claim 61 seconds ahead with the default tolerance of 0", async () => {
    expect(await verifyAt(-61, { [claim]: NOW_SECONDS })).toEqual(rejected);
  });

  it("should keep the 60-second floor under a smaller tolerance of 30", async () => {
    expect(await verifyAt(-60, { [claim]: NOW_SECONDS }, { clockTolerance: 30 })).toEqual(
      passed({ [claim]: NOW_SECONDS }),
    );
    expect(await verifyAt(-61, { [claim]: NOW_SECONDS }, { clockTolerance: 30 })).toEqual(rejected);
  });

  it("should use a tolerance of 120 when it is larger than the floor", async () => {
    expect(await verifyAt(-120, { [claim]: NOW_SECONDS }, { clockTolerance: 120 })).toEqual(
      passed({ [claim]: NOW_SECONDS }),
    );
    expect(await verifyAt(-121, { [claim]: NOW_SECONDS }, { clockTolerance: 120 })).toEqual(rejected);
  });
});

describe("maxAge", () => {
  it("should require iat", async () => {
    expect(await verify({}, { maxAge: 60 })).toEqual(
      failure({ code: "missing_claim", path: ["payload", "iat"], params: { claim: "iat" } }),
    );
  });

  it("should accept a token exactly maxAge old", async () => {
    expect(await verifyAt(60, { iat: NOW_SECONDS }, { maxAge: 60 })).toEqual(passed({ iat: NOW_SECONDS }));
  });

  it("should reject a token one second older than maxAge", async () => {
    expect(await verifyAt(61, { iat: NOW_SECONDS }, { maxAge: 60 })).toEqual(
      failure({ code: "too_old", path: ["payload", "iat"], params: { maxAge: 60 } }),
    );
  });

  it("should accept a token maxAge plus tolerance old", async () => {
    expect(await verifyAt(90, { iat: NOW_SECONDS }, { maxAge: 60, clockTolerance: 30 })).toEqual(
      passed({ iat: NOW_SECONDS }),
    );
  });

  it("should reject a token one second older than maxAge plus tolerance", async () => {
    expect(await verifyAt(91, { iat: NOW_SECONDS }, { maxAge: 60, clockTolerance: 30 })).toEqual(
      failure({ code: "too_old", path: ["payload", "iat"], params: { maxAge: 60 } }),
    );
  });
});

describe("maxAge with unusual iat", () => {
  const verifyRaw = async (payload: string, options: ClaimOptions) =>
    createVerifier({ keys: keySetOf(key), now: clockAt(), requireExpiration: false, ...options })(
      await signRaw(key, '{"alg":"HS256"}', payload),
    );

  it("should report an ill-typed iat once, without missing_claim or too_old", async () => {
    expect(await verifyRaw('{"iat":"yesterday"}', { maxAge: 60 })).toEqual(
      failure({ code: "invalid_claim", path: ["payload", "iat"] }),
    );
  });

  it("should reject an iat of -1e308 as too_old", async () => {
    expect(await verify({ iat: -1e308 }, { maxAge: 60 })).toEqual(
      failure({ code: "too_old", path: ["payload", "iat"], params: { maxAge: 60 } }),
    );
  });

  it("should accept an exp of 1e308", async () => {
    expect(await verify({ exp: 1e308 })).toEqual(passed({ exp: 1e308 }));
  });
});

describe("issuer", () => {
  it("should accept an issuer equal to the configured one", async () => {
    expect(await verify({ iss: "https://a.example" }, { issuer: "https://a.example" })).toEqual(
      passed({ iss: "https://a.example" }),
    );
  });

  it("should accept an issuer equal to any one in the list", async () => {
    const issuer = ["https://a.example", "https://b.example"];

    expect(await verify({ iss: "https://b.example" }, { issuer })).toEqual(passed({ iss: "https://b.example" }));
  });

  it("should reject an issuer outside the list", async () => {
    expect(await verify({ iss: "https://c.example" }, { issuer: ["https://a.example", "https://b.example"] })).toEqual(
      failure({ code: "wrong_issuer", path: ["payload", "iss"] }),
    );
  });

  it("should compare issuers exactly", async () => {
    expect(await verify({ iss: "https://A.example" }, { issuer: "https://a.example" })).toEqual(
      failure({ code: "wrong_issuer", path: ["payload", "iss"] }),
    );
  });

  it("should require iss", async () => {
    expect(await verify({}, { issuer: "https://a.example" })).toEqual(
      failure({ code: "missing_claim", path: ["payload", "iss"], params: { claim: "iss" } }),
    );
  });
});

describe("audience", () => {
  it("should accept a string aud equal to the audience", async () => {
    expect(await verify({ aud: "api" }, { audience: "api" })).toEqual(passed({ aud: "api" }));
  });

  it("should accept an array aud containing the audience", async () => {
    expect(await verify({ aud: ["web", "api"] }, { audience: "api" })).toEqual(passed({ aud: ["web", "api"] }));
  });

  it("should accept an aud overlapping a list of audiences", async () => {
    expect(await verify({ aud: ["web", "api"] }, { audience: ["admin", "api"] })).toEqual(
      passed({ aud: ["web", "api"] }),
    );
  });

  it("should reject an array aud without the audience", async () => {
    expect(await verify({ aud: ["web", "admin"] }, { audience: "api" })).toEqual(
      failure({ code: "wrong_audience", path: ["payload", "aud"] }),
    );
  });

  it("should reject a string aud other than the audience", async () => {
    expect(await verify({ aud: "web" }, { audience: "api" })).toEqual(
      failure({ code: "wrong_audience", path: ["payload", "aud"] }),
    );
  });

  it("should reject an empty aud array", async () => {
    expect(await verify({ aud: [] }, { audience: "api" })).toEqual(
      failure({ code: "wrong_audience", path: ["payload", "aud"] }),
    );
  });

  it("should require aud", async () => {
    expect(await verify({}, { audience: "api" })).toEqual(
      failure({ code: "missing_claim", path: ["payload", "aud"], params: { claim: "aud" } }),
    );
  });

  it("should reject a token with aud when no audience is configured", async () => {
    expect(await verify({ aud: "web" })).toEqual(failure({ code: "wrong_audience", path: ["payload", "aud"] }));
  });

  it("should reject a token with an empty aud array when no audience is configured", async () => {
    expect(await verify({ aud: [] })).toEqual(failure({ code: "wrong_audience", path: ["payload", "aud"] }));
  });

  it("should accept a token without aud when no audience is configured", async () => {
    expect(await verify({ sub: "u" })).toEqual(passed({ sub: "u" }));
  });

  it("should accept any aud when audience is false", async () => {
    expect(await verify({ aud: ["web", "admin"] }, { audience: false })).toEqual(passed({ aud: ["web", "admin"] }));
  });

  it("should accept a token without aud when audience is false", async () => {
    expect(await verify({ sub: "u" }, { audience: false })).toEqual(passed({ sub: "u" }));
  });

  it("should still report an ill-typed aud when audience is false", async () => {
    const token = await signRaw(key, '{"alg":"HS256"}', '{"aud":1}');
    const verifier = createVerifier({ keys: keySetOf(key), now: clockAt(), requireExpiration: false, audience: false });
    expect(await verifier(token)).toEqual(failure({ code: "invalid_claim", path: ["payload", "aud"] }));
  });
});

describe("exp required", () => {
  const byDefault = { requireExpiration: undefined };

  it("should require exp by default", async () => {
    expect(await verify({ sub: "u" }, byDefault)).toEqual(
      failure({ code: "missing_claim", path: ["payload", "exp"], params: { claim: "exp" } }),
    );
  });

  it("should accept a token with exp by default", async () => {
    expect(await verifyAt(-1, { exp: NOW_SECONDS }, byDefault)).toEqual(passed({ exp: NOW_SECONDS }));
  });

  it("should not require exp when maxAge is set", async () => {
    expect(await verify({ iat: NOW_SECONDS }, { ...byDefault, maxAge: 60 })).toEqual(passed({ iat: NOW_SECONDS }));
  });

  it("should not require exp when requireExpiration is false", async () => {
    expect(await verify({ sub: "u" }, { requireExpiration: false })).toEqual(passed({ sub: "u" }));
  });

  it("should require exp alongside maxAge when requireExpiration is true", async () => {
    expect(await verify({ iat: NOW_SECONDS }, { requireExpiration: true, maxAge: 60 })).toEqual(
      failure({ code: "missing_claim", path: ["payload", "exp"], params: { claim: "exp" } }),
    );
  });

  it("should report a missing exp once when requiredClaims also lists it", async () => {
    expect(await verify({ sub: "u" }, { ...byDefault, requiredClaims: ["exp", "sub"] })).toEqual(
      failure({ code: "missing_claim", path: ["payload", "exp"], params: { claim: "exp" } }),
    );
  });

  it("should report an ill-typed exp as invalid_claim, not missing_claim", async () => {
    const token = await signRaw(key, '{"alg":"HS256"}', '{"exp":"soon"}');
    expect(await createVerifier({ keys: keySetOf(key), now: clockAt() })(token)).toEqual(
      failure({ code: "invalid_claim", path: ["payload", "exp"] }),
    );
  });
});

describe("allowExpired", () => {
  it("should accept a token past exp", async () => {
    expect(await verifyAt(3600, { exp: NOW_SECONDS }, { allowExpired: true })).toEqual(passed({ exp: NOW_SECONDS }));
  });

  it("should still require exp", async () => {
    expect(await verify({ sub: "u" }, { allowExpired: true, requireExpiration: undefined })).toEqual(
      failure({ code: "missing_claim", path: ["payload", "exp"], params: { claim: "exp" } }),
    );
  });

  it("should still check nbf", async () => {
    expect(await verify({ exp: NOW_SECONDS - 1, nbf: NOW_SECONDS + 3600 }, { allowExpired: true })).toEqual(
      failure({ code: "not_yet_valid", path: ["payload", "nbf"] }),
    );
  });

  it("should still check maxAge", async () => {
    expect(await verify({ exp: NOW_SECONDS - 1, iat: NOW_SECONDS - 120 }, { allowExpired: true, maxAge: 60 })).toEqual(
      failure({ code: "too_old", path: ["payload", "iat"], params: { maxAge: 60 } }),
    );
  });
});

describe("type", () => {
  it.each([
    ["JWT", "JWT"],
    ["JWT", "jwt"],
    ["application/jwt", "JWT"],
    ["JWT", "application/JWT"],
    ["AT+JWT", "at+jwt"],
    ["application/at+jwt", "at+jwt"],
  ])("should accept typ %s for type %s", async (typ, type) => {
    expect(await verify({}, { type }, { typ })).toEqual(passed({}, { alg: "HS256", typ }));
  });

  it("should reject typ JWT when at+jwt is required", async () => {
    expect(await verify({}, { type: "at+jwt" }, { typ: "JWT" })).toEqual(
      failure({ code: "wrong_type", path: ["header", "typ"] }),
    );
  });

  it("should reject typ at+jwt when JWT is required", async () => {
    expect(await verify({}, { type: "JWT" }, { typ: "at+jwt" })).toEqual(
      failure({ code: "wrong_type", path: ["header", "typ"] }),
    );
  });

  it("should reject typ application/foo/bar when foo/bar is required", async () => {
    expect(await verify({}, { type: "foo/bar" }, { typ: "application/foo/bar" })).toEqual(
      failure({ code: "wrong_type", path: ["header", "typ"] }),
    );
  });

  it("should accept typ foo/bar when foo/bar is required", async () => {
    expect(await verify({}, { type: "foo/bar" }, { typ: "FOO/bar" })).toEqual(
      passed({}, { alg: "HS256", typ: "FOO/bar" }),
    );
  });

  it("should not fold a non-ASCII letter: typ JWK is not jwk", async () => {
    expect(await verify({}, { type: "jwk" }, { typ: "JWK" })).toEqual(
      failure({ code: "wrong_type", path: ["header", "typ"] }),
    );
  });

  it("should reject typ with media type parameters", async () => {
    expect(await verify({}, { type: "JWT" }, { typ: "JWT; charset=x" })).toEqual(
      failure({ code: "wrong_type", path: ["header", "typ"] }),
    );
  });

  it("should reject a missing typ when a type is required", async () => {
    expect(await verify({}, { type: "JWT" })).toEqual(failure({ code: "wrong_type", path: ["header", "typ"] }));
  });

  it("should accept a typ matching any type in a list", async () => {
    expect(await verify({}, { type: ["JWT", "at+jwt"] }, { typ: "AT+JWT" })).toEqual(
      passed({}, { alg: "HS256", typ: "AT+JWT" }),
    );
  });

  it("should reject a typ outside a list", async () => {
    expect(await verify({}, { type: ["JWT", "at+jwt"] }, { typ: "dpop+jwt" })).toEqual(
      failure({ code: "wrong_type", path: ["header", "typ"] }),
    );
  });

  it("should accept a missing typ when the list holds null", async () => {
    expect(await verify({}, { type: ["at+jwt", null] })).toEqual(passed({}));
  });

  it("should reject a missing typ when the list holds no null", async () => {
    expect(await verify({}, { type: ["at+jwt"] })).toEqual(failure({ code: "wrong_type", path: ["header", "typ"] }));
  });

  it("should reject any typ when the list holds only null", async () => {
    expect(await verify({}, { type: [null] }, { typ: "JWT" })).toEqual(
      failure({ code: "wrong_type", path: ["header", "typ"] }),
    );
  });
});

describe("requiredClaims", () => {
  it("should accept a token holding every required claim, whatever its value", async () => {
    expect(await verify({ sub: "user-1", tenant: null }, { requiredClaims: ["sub", "tenant"] })).toEqual(
      passed({ sub: "user-1", tenant: null }),
    );
  });

  it("should report each missing required claim in order", async () => {
    expect(await verify({ sub: "user-1" }, { requiredClaims: ["tenant", "sub", "jti"] })).toEqual(
      failure(
        { code: "missing_claim", path: ["payload", "tenant"], params: { claim: "tenant" } },
        { code: "missing_claim", path: ["payload", "jti"], params: { claim: "jti" } },
      ),
    );
  });

  it("should not report a missing claim twice", async () => {
    expect(await verify({}, { issuer: "https://a.example", requiredClaims: ["iss"] })).toEqual(
      failure({ code: "missing_claim", path: ["payload", "iss"], params: { claim: "iss" } }),
    );
  });
});

describe("registered claim types", () => {
  const verifyRaw = async (payload: string, options: ClaimOptions = {}) =>
    createVerifier({ keys: keySetOf(key), now: clockAt(), requireExpiration: false, ...options })(
      await signRaw(key, '{"alg":"HS256"}', payload),
    );

  it.each([
    ["exp", '{"exp":"1"}'],
    ["nbf", '{"nbf":null}'],
    ["iat", '{"iat":[1]}'],
    ["iss", '{"iss":1}'],
    ["sub", '{"sub":{}}'],
    ["jti", '{"jti":true}'],
    ["aud", '{"aud":["a",1]}'],
  ])("should reject an ill-typed %s", async (name, payload) => {
    expect(await verifyRaw(payload)).toEqual(failure({ code: "invalid_claim", path: ["payload", name] }));
  });

  it("should report an ill-typed claim once, not again from its check", async () => {
    expect(await verifyRaw('{"iss":1,"aud":2}', { issuer: "x", audience: "y" })).toEqual(
      failure({ code: "invalid_claim", path: ["payload", "iss"] }, { code: "invalid_claim", path: ["payload", "aud"] }),
    );
  });
});

describe("claim failures together", () => {
  it("should report every failing claim in check order", async () => {
    const payload = { exp: NOW_SECONDS - 10, nbf: NOW_SECONDS + 100, iss: "https://evil.example", aud: "web" };
    const options: ClaimOptions = {
      issuer: "https://a.example",
      audience: "api",
      type: "at+jwt",
      maxAge: 60,
      requiredClaims: ["sub"],
    };

    expect(await verify(payload, options, { typ: "JWT" })).toEqual(
      failure(
        { code: "expired", path: ["payload", "exp"] },
        { code: "not_yet_valid", path: ["payload", "nbf"] },
        { code: "missing_claim", path: ["payload", "iat"], params: { claim: "iat" } },
        { code: "wrong_issuer", path: ["payload", "iss"] },
        { code: "wrong_audience", path: ["payload", "aud"] },
        { code: "wrong_type", path: ["header", "typ"] },
        { code: "missing_claim", path: ["payload", "sub"], params: { claim: "sub" } },
      ),
    );
  });

  it("should not echo token or claim values in a failure", async () => {
    const payload = { iss: "ISSUER-SECRET", aud: "AUDIENCE-SECRET", exp: NOW_SECONDS - 1, sub: "SUBJECT-SECRET" };
    const token = await sign({ payload, key, header: { typ: "TYPE-SECRET", kid: "KID-SECRET" } });
    const result = await createVerifier({
      keys: keySetOf(key),
      now: clockAt(),
      issuer: "https://a.example",
      audience: "api",
      type: "JWT",
    })(token);
    const serialized = JSON.stringify(result);

    expect(
      [...token.split("."), "ISSUER-SECRET", "AUDIENCE-SECRET", "SUBJECT-SECRET", "TYPE-SECRET", "KID-SECRET"].filter(
        (secret) => serialized.includes(secret),
      ),
    ).toEqual([]);
  });
});

/** A hand-made Standard Schema requiring a string `role`, reporting issues as the given validate does. */
const schemaOf = (
  validate: StandardSchemaV1.Props<{ role: string }>["validate"],
): StandardSchemaV1<{ role: string }> => ({ "~standard": { version: 1, vendor: "test", validate } });

const requireRole = (value: unknown): StandardSchemaV1.Result<{ role: string }> =>
  typeof (value as { role?: unknown }).role === "string"
    ? { value: value as { role: string } }
    : { issues: [{ message: `role missing in ${JSON.stringify(value)}`, path: ["role"] }] };

describe("claims schema", () => {
  it("should accept a payload the schema accepts", async () => {
    expect(await verify({ role: "admin" }, { claims: schemaOf(requireRole) })).toEqual(passed({ role: "admin" }));
  });

  it("should report a schema issue by path and drop its message", async () => {
    expect(await verify({ sub: "SUBJECT-SECRET" }, { claims: schemaOf(requireRole) })).toEqual(
      failure({ code: "invalid_claims", path: ["payload", "role"] }),
    );
  });

  it("should await an asynchronous schema", async () => {
    const claims = schemaOf(async (value) => requireRole(value));

    expect(await verify({}, { claims })).toEqual(failure({ code: "invalid_claims", path: ["payload", "role"] }));
  });

  it("should map path segment objects to their keys and drop symbol keys", async () => {
    const claims = schemaOf(() => ({
      issues: [{ message: "a", path: [{ key: "profile" }, 0, Symbol("hidden"), { key: "name" }] }, { message: "b" }],
    }));

    expect(await verify({}, { claims })).toEqual(
      failure(
        { code: "invalid_claims", path: ["payload", "profile", 0, "name"] },
        { code: "invalid_claims", path: ["payload"] },
      ),
    );
  });

  it("should report a failure the schema gives without issues", async () => {
    const claims = schemaOf(() => ({ issues: [] }));

    expect(await verify({}, { claims })).toEqual(failure({ code: "invalid_claims", path: ["payload"] }));
  });

  it("should return the token's payload, not the schema's output", async () => {
    const claims = schemaOf(() => ({ value: { role: "transformed" } }));

    expect(await verify({ role: "admin" }, { claims })).toEqual(passed({ role: "admin" }));
  });

  it("should not run the schema when another claim check failed", async () => {
    const validate = vi.fn(requireRole);

    await verify({ exp: NOW_SECONDS }, { claims: schemaOf(validate) });

    expect(validate).not.toHaveBeenCalled();
  });

  it.each([
    [
      "throws",
      () => {
        throw new Error("boom");
      },
    ],
    ["rejects", async () => Promise.reject(new Error("boom"))],
  ])("should reject the verifier's promise with the schema's error when the schema %s", async (_, validate) => {
    const claims = schemaOf(validate as never);

    await expect(verify({ role: "admin" }, { claims })).rejects.toThrow("boom");
  });

  it.each([
    ["returns undefined", () => undefined],
    ["returns a result with non-array issues", () => ({ issues: "x" })],
  ])("should reject the verifier's promise when the schema %s", async (_, validate) => {
    const claims = schemaOf(validate as never);

    await expect(verify({ role: "admin" }, { claims })).rejects.toBeInstanceOf(TypeError);
  });

  it("should keep a path naming a payload key", async () => {
    const claims = schemaOf(() => ({ issues: [{ message: "m", path: ["PAYLOAD-KEY"] }] }));

    expect(await verify({}, { claims })).toEqual(failure({ code: "invalid_claims", path: ["payload", "PAYLOAD-KEY"] }));
  });

  it("should accept a callable schema", async () => {
    const claims = Object.assign(() => undefined, schemaOf(requireRole));

    expect(await verify({ role: "admin" }, { claims })).toEqual(passed({ role: "admin" }));
  });
});
