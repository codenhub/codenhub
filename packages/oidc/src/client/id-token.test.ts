import { type KeyPair, exportPublicJwk, generateKeyPair, sign } from "@codenhub/jwt";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { computeTokenHash } from "../shared/token-hash";
import type { OidcIssue, OidcResult } from "../shared/types";
import { createIdTokenValidator, type IdTokenExpectations } from "./id-token";
import { resolveClientOptions } from "./options";

const ISSUER = "https://op.example";
const CLIENT_ID = "app";
const NOW_S = Math.floor(Date.now() / 1000);

const metadataWith = (jwksUri: string) => ({
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/authorize`,
  token_endpoint: `${ISSUER}/token`,
  jwks_uri: jwksUri,
  response_types_supported: ["code"],
  subject_types_supported: ["public"],
  id_token_signing_alg_values_supported: ["ES256"],
});

let keys: KeyPair;
let jwks: { readonly keys: readonly unknown[] };

beforeAll(async () => {
  keys = await generateKeyPair({ alg: "ES256", kid: "op-1" });
  jwks = { keys: [await exportPublicJwk(keys.publicKey)] };
});

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A validator for this client, whose JWKS comes from `fetch`. */
const validatorWith = (fetchFunction: typeof fetch, clockTolerance?: number) =>
  createIdTokenValidator(
    resolveClientOptions({
      metadata: metadataWith(`${ISSUER}/jwks`),
      clientId: CLIENT_ID,
      redirectUri: "https://app.example/callback",
      auth: { method: "none" },
      fetch: fetchFunction,
      clockTolerance,
      now: () => NOW_S * 1000,
    }),
  );

const serveJwks = () => vi.fn(async () => jsonResponse(jwks));

const validator = () => validatorWith(serveJwks());

const baseClaims = (): Record<string, unknown> => ({
  iss: ISSUER,
  sub: "user-1",
  aud: CLIENT_ID,
  exp: NOW_S + 300,
  iat: NOW_S,
  auth_time: NOW_S,
  nonce: "nonce-1",
});

interface TokenOptions {
  /** Claims to remove after the changes are applied. */
  readonly remove?: readonly string[];
  readonly key?: KeyPair["privateKey"];
  readonly typ?: string;
}

/** Signs an ID token from the base claims, with the changes and removals applied. */
async function tokenWith(changes: Record<string, unknown> = {}, options: TokenOptions = {}): Promise<string> {
  const payload = { ...baseClaims(), ...changes };
  for (const name of options.remove ?? []) {
    delete payload[name];
  }
  return sign({ payload, key: options.key ?? keys.privateKey, header: { typ: options.typ ?? "JWT" } });
}

const expected: IdTokenExpectations = { nonce: "nonce-1" };

const issuesOf = (result: OidcResult<unknown>): readonly OidcIssue[] => {
  if (result.ok) {
    throw new Error("expected a failed result");
  }
  return result.error.issues;
};

const jwtCodesOf = (result: OidcResult<unknown>): unknown[] => issuesOf(result).map((issue) => issue.params?.jwtCode);

describe("createIdTokenValidator", () => {
  describe("a valid token", () => {
    it("returns the payload as the claims", async () => {
      const result = await validator()(await tokenWith(), expected);

      expect(result).toMatchObject({ ok: true, value: { sub: "user-1", iss: ISSUER, aud: CLIENT_ID } });
    });

    it("accepts a token that carries no optional claims", async () => {
      const token = await tokenWith({}, { remove: ["nonce", "auth_time"] });

      const result = await validator()(token, {});

      expect(result.ok).toBe(true);
    });

    it("fetches the JWKS once and reuses it for later tokens", async () => {
      const fetch = serveJwks();
      const validate = validatorWith(fetch);

      await validate(await tokenWith(), expected);
      await validate(await tokenWith(), expected);

      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("the token itself", () => {
    it("refuses a token whose audience is another client", async () => {
      const result = await validator()(await tokenWith({ aud: "other-app" }), expected);

      expect(jwtCodesOf(result)).toEqual(["wrong_audience"]);
    });

    it("refuses a token whose issuer is another provider", async () => {
      const result = await validator()(await tokenWith({ iss: "https://evil.example" }), expected);

      expect(jwtCodesOf(result)).toEqual(["wrong_issuer"]);
    });

    it("refuses an expired token", async () => {
      const result = await validator()(await tokenWith({ exp: NOW_S - 1 }), expected);

      expect(jwtCodesOf(result)).toEqual(["expired"]);
    });

    it("refuses a token signed by a key the provider did not publish", async () => {
      const other = await generateKeyPair({ alg: "ES256", kid: "op-1" });

      const result = await validator()(await tokenWith({}, { key: other.privateKey }), expected);

      expect(jwtCodesOf(result)).toEqual(["bad_signature"]);
    });

    it("refuses a token with a missing sub claim", async () => {
      const result = await validator()(await tokenWith({}, { remove: ["sub"] }), expected);

      expect(jwtCodesOf(result)).toEqual(["missing_claim"]);
    });

    it("maps every jwt issue under the id_token path", async () => {
      const result = await validator()(await tokenWith({ aud: "other-app", exp: NOW_S - 1 }), expected);

      expect(issuesOf(result)).toEqual([
        { code: "invalid_id_token", path: ["id_token", "payload", "exp"], params: { jwtCode: "expired" } },
        { code: "invalid_id_token", path: ["id_token", "payload", "aud"], params: { jwtCode: "wrong_audience" } },
      ]);
    });

    it("refuses a token that is not a JWT at all, without throwing", async () => {
      const result = await validator()("not-a-token", expected);

      expect(result.ok).toBe(false);
    });

    it("reports a JWKS that cannot be fetched as a key fetch failure", async () => {
      const failing = validatorWith(vi.fn(async () => jsonResponse({}, 500)));

      const result = await failing(await tokenWith(), expected);

      expect(jwtCodesOf(result)).toEqual(["key_fetch_failed"]);
    });
  });

  describe("the ID token claims", () => {
    it("refuses an access token presented as an ID token", async () => {
      const result = await validator()(await tokenWith({}, { typ: "at+jwt" }), expected);

      expect(issuesOf(result)).toEqual([
        { code: "invalid_id_token", path: ["id_token", "header", "typ"], params: { jwtCode: "wrong_type" } },
      ]);
    });

    it("refuses an access token presented as an ID token under an application media type", async () => {
      const result = await validator()(await tokenWith({}, { typ: "application/AT+JWT" }), expected);

      expect(jwtCodesOf(result)).toEqual(["wrong_type"]);
    });

    it("refuses a token whose sub is an empty string", async () => {
      const result = await validator()(await tokenWith({ sub: "" }), expected);

      expect(issuesOf(result)).toEqual([
        {
          code: "invalid_id_token",
          path: ["id_token", "payload", "sub"],
          params: { jwtCode: "invalid_claim" },
        },
      ]);
    });

    it("refuses an amr that is a string rather than an array", async () => {
      const result = await validator()(await tokenWith({ amr: "pwd" }), expected);

      expect(issuesOf(result)).toEqual([
        {
          code: "invalid_id_token",
          path: ["id_token", "payload", "amr"],
          params: { jwtCode: "invalid_claim" },
        },
      ]);
    });

    it("refuses an amr with an entry that is not a string", async () => {
      const result = await validator()(await tokenWith({ amr: ["pwd", 1] }), expected);

      expect(issuesOf(result)).toEqual([
        {
          code: "invalid_id_token",
          path: ["id_token", "payload", "amr"],
          params: { jwtCode: "invalid_claim" },
        },
      ]);
    });

    it("refuses an acr that is not a string", async () => {
      const result = await validator()(await tokenWith({ acr: 1 }), expected);

      expect(issuesOf(result)).toEqual([
        {
          code: "invalid_id_token",
          path: ["id_token", "payload", "acr"],
          params: { jwtCode: "invalid_claim" },
        },
      ]);
    });

    it("refuses an azp that is an array rather than a string", async () => {
      const result = await validator()(await tokenWith({ azp: [CLIENT_ID] }), expected);

      expect(issuesOf(result)).toEqual([
        {
          code: "invalid_id_token",
          path: ["id_token", "payload", "azp"],
          params: { jwtCode: "invalid_claim" },
        },
      ]);
    });

    it("refuses a nonce that is not a string, reported as a claim type and not a mismatch", async () => {
      const result = await validator()(await tokenWith({ nonce: 1 }), expected);

      expect(issuesOf(result)).toEqual([
        {
          code: "invalid_id_token",
          path: ["id_token", "payload", "nonce"],
          params: { jwtCode: "invalid_claim" },
        },
      ]);
    });

    it("accepts an amr array of strings and an acr string", async () => {
      const result = await validator()(await tokenWith({ amr: ["pwd", "mfa"], acr: "urn:x" }), expected);

      expect(result).toMatchObject({ ok: true, value: { amr: ["pwd", "mfa"], acr: "urn:x" } });
    });

    it("refuses a token with a wrong nonce", async () => {
      const result = await validator()(await tokenWith({ nonce: "nonce-2" }), expected);

      expect(issuesOf(result)).toEqual([{ code: "nonce_mismatch", path: ["id_token", "payload", "nonce"] }]);
    });

    it("refuses a token without a nonce when one was expected", async () => {
      const result = await validator()(await tokenWith({}, { remove: ["nonce"] }), expected);

      expect(issuesOf(result)).toEqual([{ code: "nonce_mismatch", path: ["id_token", "payload", "nonce"] }]);
    });

    it("accepts a token with any nonce when none was expected", async () => {
      const result = await validator()(await tokenWith({ nonce: "anything" }), {});

      expect(result.ok).toBe(true);
    });

    it("refuses a token with several audiences and no azp", async () => {
      const result = await validator()(await tokenWith({ aud: [CLIENT_ID, "other-app"] }), expected);

      expect(issuesOf(result)).toEqual([{ code: "azp_mismatch", path: ["id_token", "payload", "azp"] }]);
    });

    it("accepts several audiences when azp names this client", async () => {
      const result = await validator()(await tokenWith({ aud: [CLIENT_ID, "other-app"], azp: CLIENT_ID }), expected);

      expect(result.ok).toBe(true);
    });

    it("refuses an azp that names another client", async () => {
      const result = await validator()(await tokenWith({ aud: [CLIENT_ID, "other-app"], azp: "other-app" }), expected);

      expect(issuesOf(result)).toEqual([{ code: "azp_mismatch", path: ["id_token", "payload", "azp"] }]);
    });

    it("refuses an auth_time that is not a number", async () => {
      const result = await validator()(await tokenWith({ auth_time: "yesterday" }), expected);

      expect(issuesOf(result)).toEqual([
        {
          code: "invalid_id_token",
          path: ["id_token", "payload", "auth_time"],
          params: { jwtCode: "invalid_claim" },
        },
      ]);
    });

    it("refuses max_age when auth_time is missing", async () => {
      const result = await validator()(await tokenWith({}, { remove: ["auth_time"] }), {
        nonce: "nonce-1",
        maxAge: 300,
      });

      expect(issuesOf(result)).toEqual([{ code: "auth_time_missing", path: ["id_token", "payload", "auth_time"] }]);
    });

    it("refuses max_age when the authentication is older than allowed", async () => {
      const result = await validator()(await tokenWith({ auth_time: NOW_S - 1000 }), {
        nonce: "nonce-1",
        maxAge: 300,
      });

      expect(issuesOf(result)).toEqual([{ code: "auth_too_old", path: ["id_token", "payload", "auth_time"] }]);
    });

    it("accepts an authentication within max_age", async () => {
      const result = await validator()(await tokenWith({ auth_time: NOW_S - 100 }), { nonce: "nonce-1", maxAge: 300 });

      expect(result.ok).toBe(true);
    });

    it("allows the clock tolerance on top of max_age", async () => {
      const result = await validatorWith(serveJwks(), 60)(await tokenWith({ auth_time: NOW_S - 350 }), {
        nonce: "nonce-1",
        maxAge: 300,
      });

      expect(result.ok).toBe(true);
    });

    it("refuses an at_hash that does not match the access token", async () => {
      const wrongHash = await computeTokenHash("some-other-token", "ES256");
      const result = await validator()(await tokenWith({ at_hash: wrongHash }), {
        nonce: "nonce-1",
        accessToken: "at-1",
      });

      expect(issuesOf(result)).toEqual([{ code: "at_hash_mismatch", path: ["id_token", "payload", "at_hash"] }]);
    });

    it("accepts an at_hash that matches the access token", async () => {
      const hash = await computeTokenHash("at-1", "ES256");
      const result = await validator()(await tokenWith({ at_hash: hash }), { nonce: "nonce-1", accessToken: "at-1" });

      expect(result.ok).toBe(true);
    });

    it("refuses a subject that is not the expected one", async () => {
      const result = await validator()(await tokenWith(), { subject: "user-2" });

      expect(issuesOf(result)).toEqual([{ code: "subject_mismatch", path: ["id_token", "payload", "sub"] }]);
    });

    it("reports every failing claim in one result", async () => {
      const token = await tokenWith({ nonce: "nonce-2", auth_time: NOW_S - 1000 });

      const result = await validator()(token, { nonce: "nonce-1", maxAge: 300, subject: "user-2" });

      expect(issuesOf(result).map((issue) => issue.code)).toEqual([
        "nonce_mismatch",
        "auth_too_old",
        "subject_mismatch",
      ]);
    });
  });
});
