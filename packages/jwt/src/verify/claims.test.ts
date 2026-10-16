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
  return createVerifier({ keys: keySetOf(key), now: clockAt(offsetSeconds), ...options })(token);
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

describe("nbf", () => {
  it("should accept a token at exactly nbf", async () => {
    expect(await verify({ nbf: NOW_SECONDS })).toEqual(passed({ nbf: NOW_SECONDS }));
  });

  it("should reject a token one second before nbf", async () => {
    expect(await verifyAt(-1, { nbf: NOW_SECONDS })).toEqual(
      failure({ code: "not_yet_valid", path: ["payload", "nbf"] }),
    );
  });

  it("should accept a token 30 seconds before nbf with a tolerance of 30", async () => {
    expect(await verifyAt(-30, { nbf: NOW_SECONDS }, { clockTolerance: 30 })).toEqual(passed({ nbf: NOW_SECONDS }));
  });

  it("should reject a token 31 seconds before nbf with a tolerance of 30", async () => {
    expect(await verifyAt(-31, { nbf: NOW_SECONDS }, { clockTolerance: 30 })).toEqual(
      failure({ code: "not_yet_valid", path: ["payload", "nbf"] }),
    );
  });
});

describe("iat", () => {
  it("should accept a token issued exactly now", async () => {
    expect(await verify({ iat: NOW_SECONDS })).toEqual(passed({ iat: NOW_SECONDS }));
  });

  it("should reject a token issued one second in the future", async () => {
    expect(await verifyAt(-1, { iat: NOW_SECONDS })).toEqual(
      failure({ code: "issued_in_future", path: ["payload", "iat"] }),
    );
  });

  it("should accept a token issued 30 seconds in the future with a tolerance of 30", async () => {
    expect(await verifyAt(-30, { iat: NOW_SECONDS }, { clockTolerance: 30 })).toEqual(passed({ iat: NOW_SECONDS }));
  });

  it("should reject a token issued 31 seconds in the future with a tolerance of 30", async () => {
    expect(await verifyAt(-31, { iat: NOW_SECONDS }, { clockTolerance: 30 })).toEqual(
      failure({ code: "issued_in_future", path: ["payload", "iat"] }),
    );
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

  it("should ignore aud when no audience is configured", async () => {
    expect(await verify({ aud: "web" })).toEqual(passed({ aud: "web" }));
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

  it("should reject a missing typ when a type is required", async () => {
    expect(await verify({}, { type: "JWT" })).toEqual(failure({ code: "wrong_type", path: ["header", "typ"] }));
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
    createVerifier({ keys: keySetOf(key), now: clockAt(), ...options })(await signRaw(key, '{"alg":"HS256"}', payload));

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
    const payload = { exp: NOW_SECONDS - 10, nbf: NOW_SECONDS + 10, iss: "https://evil.example", aud: "web" };
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

  it("should accept a callable schema", async () => {
    const claims = Object.assign(() => undefined, schemaOf(requireRole));

    expect(await verify({ role: "admin" }, { claims })).toEqual(passed({ role: "admin" }));
  });
});
