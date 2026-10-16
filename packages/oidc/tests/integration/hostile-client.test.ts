import type { SignHeader } from "@codenhub/jwt";
import { beforeEach, describe, expect, it } from "vitest";

import { discover } from "../../src/client";
import {
  appendParam,
  claimsFor,
  clientWith,
  codeOf,
  editJson,
  forgeIdToken,
  foreignIdToken,
  type Harness,
  ISSUER,
  jsonResponse,
  JWKS_URL,
  onlyAt,
  REDIRECT_URI,
  setUp,
  signedIn,
  startSignIn,
  swapIdToken,
  TOKEN_URL,
  unsignedToken,
  USERINFO_URL,
  withParams,
} from "./client-support";

/** A discovery document for the provider, valid on every member this package checks. */
const DOCUMENT = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/authorize`,
  token_endpoint: TOKEN_URL,
  jwks_uri: JWKS_URL,
  userinfo_endpoint: USERINFO_URL,
  response_types_supported: ["code"],
  subject_types_supported: ["public"],
  id_token_signing_alg_values_supported: ["ES256"],
  code_challenge_methods_supported: ["S256"],
  authorization_response_iss_parameter_supported: true,
};

/** A `fetch` that answers every request with a fresh response from `make`. */
const respondWith =
  (make: () => Response): typeof fetch =>
  async () =>
    make();

/** A `fetch` that never answers, and gives up only when the client aborts the request. */
const hangs: typeof fetch = (_input, init) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
  });

const requestFailed = (params: Readonly<Record<string, string | number>>) => ({
  ok: false,
  error: { issues: [{ code: "request_failed", params }] },
});

const failedWith = (issues: readonly object[]) => ({ ok: false, error: { issues } });

let harness: Harness;

beforeEach(async () => {
  harness = await setUp();
});

describe("discovery", () => {
  it("refuses a document whose issuer lacks the trailing slash the request had, with issuer_mismatch", async () => {
    const result = await discover(`${ISSUER}/`, { fetch: respondWith(() => jsonResponse(DOCUMENT)) });
    expect(result).toEqual(failedWith([{ code: "issuer_mismatch", path: ["metadata", "issuer"] }]));
  });

  it("refuses a document issued for another host with issuer_mismatch", async () => {
    const other = { ...DOCUMENT, issuer: "https://evil.example" };
    const result = await discover(ISSUER, { fetch: respondWith(() => jsonResponse(other)) });
    expect(result).toEqual(failedWith([{ code: "issuer_mismatch", path: ["metadata", "issuer"] }]));
  });

  it("fails a 404 with request_failed status 404", async () => {
    const result = await discover(ISSUER, { fetch: respondWith(() => new Response(null, { status: 404 })) });
    expect(result).toEqual(requestFailed({ endpoint: "discovery", reason: "status", status: 404 }));
  });

  it("does not follow a 302 and fails with request_failed status 302", async () => {
    const redirect = () =>
      new Response(null, { status: 302, headers: { location: "https://elsewhere.example/.well-known" } });
    const result = await discover(ISSUER, { fetch: respondWith(redirect) });
    expect(result).toEqual(requestFailed({ endpoint: "discovery", reason: "status", status: 302 }));
  });

  it("fails a 200 that is not JSON with request_failed content_type", async () => {
    const html = () => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } });
    const result = await discover(ISSUER, { fetch: respondWith(html) });
    expect(result).toEqual(requestFailed({ endpoint: "discovery", reason: "content_type" }));
  });

  it("fails a body that is not valid JSON with request_failed malformed", async () => {
    const broken = () => new Response("{", { status: 200, headers: { "content-type": "application/json" } });
    const result = await discover(ISSUER, { fetch: respondWith(broken) });
    expect(result).toEqual(requestFailed({ endpoint: "discovery", reason: "malformed" }));
  });

  it("fails a JSON array, which is not an object, with request_failed malformed", async () => {
    const array = () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    const result = await discover(ISSUER, { fetch: respondWith(array) });
    expect(result).toEqual(requestFailed({ endpoint: "discovery", reason: "malformed" }));
  });

  it("fails a body over 65536 bytes with request_failed too_large when no content-length is sent", async () => {
    const huge = () =>
      new Response(JSON.stringify({ ...DOCUMENT, padding: "x".repeat(70_000) }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    const result = await discover(ISSUER, { fetch: respondWith(huge) });
    expect(result).toEqual(requestFailed({ endpoint: "discovery", reason: "too_large" }));
  });

  it("fails a declared content-length over 65536 with request_failed too_large before reading the body", async () => {
    const declared = () =>
      new Response(JSON.stringify({ ...DOCUMENT, padding: "x".repeat(70_000) }), {
        status: 200,
        headers: { "content-type": "application/json", "content-length": "70000" },
      });
    const result = await discover(ISSUER, { fetch: respondWith(declared) });
    expect(result).toEqual(requestFailed({ endpoint: "discovery", reason: "too_large" }));
  });

  it("fails a response that never arrives with request_failed timeout", async () => {
    const result = await discover(ISSUER, { fetch: hangs, timeout: 1 });
    expect(result).toEqual(requestFailed({ endpoint: "discovery", reason: "timeout" }));
  });

  it("fails a fetch that rejects with request_failed network", async () => {
    const rejects: typeof fetch = async () => {
      throw new TypeError("fetch failed");
    };
    const result = await discover(ISSUER, { fetch: rejects });
    expect(result).toEqual(requestFailed({ endpoint: "discovery", reason: "network" }));
  });
});

describe("callback: mix-up and CSRF", () => {
  it("refuses a state that differs from the pending one with state_mismatch", async () => {
    const started = await startSignIn();
    const result = await started.client.callback(
      withParams(started.location, { state: "forged-state" }),
      started.pending,
    );
    expect(result).toEqual(failedWith([{ code: "state_mismatch", path: ["callback", "state"] }]));
  });

  it("refuses a callback with no state with invalid_callback", async () => {
    const started = await startSignIn();
    const result = await started.client.callback(withParams(started.location, { state: undefined }), started.pending);
    expect(result).toEqual(failedWith([{ code: "invalid_callback", path: ["callback", "state"] }]));
  });

  it("refuses a callback that carries code twice with invalid_callback reason duplicate", async () => {
    const started = await startSignIn();
    const doubled = appendParam(started.location, "code", codeOf(started.location));
    const result = await started.client.callback(doubled, started.pending);
    expect(result).toEqual(
      failedWith([{ code: "invalid_callback", path: ["callback"], params: { reason: "duplicate" } }]),
    );
  });

  it("refuses an iss of another issuer with iss_mismatch", async () => {
    const started = await startSignIn();
    const result = await started.client.callback(
      withParams(started.location, { iss: "https://evil.example" }),
      started.pending,
    );
    expect(result).toEqual(failedWith([{ code: "iss_mismatch", path: ["callback", "iss"] }]));
  });

  it("refuses a callback without iss, which the provider advertises, with iss_mismatch", async () => {
    const started = await startSignIn();
    const result = await started.client.callback(withParams(started.location, { iss: undefined }), started.pending);
    expect(result).toEqual(failedWith([{ code: "iss_mismatch", path: ["callback", "iss"] }]));
  });

  it("reports a provider error with only its endpoint and a known OAuth code, never its description", async () => {
    const started = await startSignIn();
    const url = new URL(REDIRECT_URI);
    url.searchParams.set("state", started.pending.state);
    url.searchParams.set("iss", ISSUER);
    url.searchParams.set("error", "access_denied");
    url.searchParams.set("error_description", "<script>secret");
    const result = await started.client.callback(url.href, started.pending);
    expect(result).toEqual(
      failedWith([{ code: "provider_error", params: { endpoint: "authorization", error: "access_denied" } }]),
    );
  });

  it("reports an error code the client does not know as unknown", async () => {
    const started = await startSignIn();
    const url = new URL(REDIRECT_URI);
    url.searchParams.set("state", started.pending.state);
    url.searchParams.set("iss", ISSUER);
    url.searchParams.set("error", "made_up");
    const result = await started.client.callback(url.href, started.pending);
    expect(result).toEqual(
      failedWith([{ code: "provider_error", params: { endpoint: "authorization", error: "unknown" } }]),
    );
  });
});

/** Signs in with an ID token built from `overrides` (and `header`), swapped into the token response. */
async function forgedCallback(
  overrides: Readonly<Record<string, unknown>>,
  options: { readonly header?: SignHeader; readonly maxAge?: number } = {},
) {
  const started = await startSignIn(options.maxAge === undefined ? {} : { maxAge: options.maxAge });
  const forged = await forgeIdToken(claimsFor(started.pending, overrides), options.header);
  harness.setTamper(swapIdToken(async () => forged));
  return started.client.callback(started.location, started.pending);
}

describe("ID token", () => {
  it("refuses a nonce that is not the pending one with nonce_mismatch", async () => {
    expect(await forgedCallback({ nonce: "not-the-nonce" })).toEqual(
      failedWith([{ code: "nonce_mismatch", path: ["id_token", "payload", "nonce"] }]),
    );
  });

  it("refuses an ID token with no nonce with nonce_mismatch", async () => {
    expect(await forgedCallback({ nonce: undefined })).toEqual(
      failedWith([{ code: "nonce_mismatch", path: ["id_token", "payload", "nonce"] }]),
    );
  });

  it("refuses an audience of another client with invalid_id_token wrong_audience", async () => {
    expect(await forgedCallback({ aud: "other" })).toEqual(
      failedWith([
        {
          code: "invalid_id_token",
          path: ["id_token", "payload", "aud"],
          params: { jwtCode: "wrong_audience" },
        },
      ]),
    );
  });

  it("refuses an issuer other than the provider's with invalid_id_token wrong_issuer", async () => {
    expect(await forgedCallback({ iss: "https://evil.example" })).toEqual(
      failedWith([
        {
          code: "invalid_id_token",
          path: ["id_token", "payload", "iss"],
          params: { jwtCode: "wrong_issuer" },
        },
      ]),
    );
  });

  it("refuses a multi-valued audience with no azp with azp_mismatch", async () => {
    expect(await forgedCallback({ aud: ["app", "other"] })).toEqual(
      failedWith([{ code: "azp_mismatch", path: ["id_token", "payload", "azp"] }]),
    );
  });

  it("refuses an azp naming another client with azp_mismatch", async () => {
    expect(await forgedCallback({ azp: "other" })).toEqual(
      failedWith([{ code: "azp_mismatch", path: ["id_token", "payload", "azp"] }]),
    );
  });

  it("refuses an expired ID token with invalid_id_token expired", async () => {
    const now = Math.floor(Date.now() / 1000);
    expect(await forgedCallback({ exp: now - 60, iat: now - 360 })).toEqual(
      failedWith([
        {
          code: "invalid_id_token",
          path: ["id_token", "payload", "exp"],
          params: { jwtCode: "expired" },
        },
      ]),
    );
  });

  it("refuses an ID token signed by a foreign key with the same kid with invalid_id_token bad_signature", async () => {
    const started = await startSignIn();
    const forged = await foreignIdToken(claimsFor(started.pending));
    harness.setTamper(swapIdToken(async () => forged));
    expect(await started.client.callback(started.location, started.pending)).toEqual(
      failedWith([{ code: "invalid_id_token", path: ["id_token"], params: { jwtCode: "bad_signature" } }]),
    );
  });

  it("refuses an ID token whose typ is at+jwt with invalid_id_token at the header typ", async () => {
    expect(await forgedCallback({}, { header: { typ: "at+jwt" } })).toEqual(
      failedWith([
        {
          code: "invalid_id_token",
          path: ["id_token", "header", "typ"],
          params: { jwtCode: "wrong_type" },
        },
      ]),
    );
  });

  it("refuses an at_hash that does not match the access token with at_hash_mismatch", async () => {
    const started = await startSignIn();
    const forged = await forgeIdToken(claimsFor(started.pending, { at_hash: "not-the-hash" }));
    harness.setTamper(swapIdToken(async () => forged));
    expect(await started.client.callback(started.location, started.pending)).toEqual(
      failedWith([{ code: "at_hash_mismatch", path: ["id_token", "payload", "at_hash"] }]),
    );
  });

  // The empty signature is what jwt reports, before it reads the header's alg. The task asks only for
  // invalid_id_token here, so this pins the refusal's code and path as jwt gives them.
  it("refuses an unsigned token with alg none with invalid_id_token", async () => {
    const started = await startSignIn();
    const unsigned = unsignedToken(claimsFor(started.pending), { alg: "none" });
    harness.setTamper(swapIdToken(async () => unsigned));
    expect(await started.client.callback(started.location, started.pending)).toEqual(
      failedWith([
        {
          code: "invalid_id_token",
          path: ["id_token", "signature"],
          params: { jwtCode: "malformed" },
        },
      ]),
    );
  });

  it("refuses an ID token without auth_time when max_age was requested with auth_time_missing", async () => {
    expect(await forgedCallback({ auth_time: undefined }, { maxAge: 300 })).toEqual(
      failedWith([{ code: "auth_time_missing", path: ["id_token", "payload", "auth_time"] }]),
    );
  });

  it("refuses an auth_time older than max_age with auth_too_old", async () => {
    const hourAgo = Math.floor(Date.now() / 1000) - 3600;
    expect(await forgedCallback({ auth_time: hourAgo }, { maxAge: 300 })).toEqual(
      failedWith([{ code: "auth_too_old", path: ["id_token", "payload", "auth_time"] }]),
    );
  });
});

describe("token endpoint", () => {
  it("fails a token response that never arrives within the timeout with request_failed timeout", async () => {
    const started = await startSignIn();
    harness.setTamper(onlyAt(TOKEN_URL, () => new Promise<Response>(() => {})));
    const result = await clientWith(harness, { timeout: 1 }).callback(started.location, started.pending);
    expect(result).toEqual(requestFailed({ endpoint: "token", reason: "timeout" }));
  });

  it("fails a token response over 65536 bytes with request_failed too_large", async () => {
    const started = await startSignIn();
    const huge = () =>
      new Response(JSON.stringify({ access_token: "a", token_type: "Bearer", padding: "y".repeat(70_000) }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    harness.setTamper(onlyAt(TOKEN_URL, huge));
    expect(await started.client.callback(started.location, started.pending)).toEqual(
      requestFailed({ endpoint: "token", reason: "too_large" }),
    );
  });

  it("fails a token response that is not JSON with request_failed malformed", async () => {
    const started = await startSignIn();
    const broken = () => new Response("{not json", { status: 200, headers: { "content-type": "application/json" } });
    harness.setTamper(onlyAt(TOKEN_URL, broken));
    expect(await started.client.callback(started.location, started.pending)).toEqual(
      requestFailed({ endpoint: "token", reason: "malformed" }),
    );
  });

  it("refuses a token_type other than Bearer with invalid_token_response at response.token_type", async () => {
    const started = await startSignIn();
    harness.setTamper(
      onlyAt(
        TOKEN_URL,
        editJson((body) => ({ ...body, token_type: "mac" })),
      ),
    );
    expect(await started.client.callback(started.location, started.pending)).toEqual(
      failedWith([{ code: "invalid_token_response", path: ["response", "token_type"] }]),
    );
  });

  it("refuses a token response with no access_token with invalid_token_response at response.access_token", async () => {
    const started = await startSignIn();
    harness.setTamper(
      onlyAt(
        TOKEN_URL,
        editJson((body) => {
          const copy = { ...body };
          delete copy.access_token;
          return copy;
        }),
      ),
    );
    expect(await started.client.callback(started.location, started.pending)).toEqual(
      failedWith([{ code: "invalid_token_response", path: ["response", "access_token"] }]),
    );
  });
});

describe("userinfo", () => {
  it("refuses claims whose sub is another user's with subject_mismatch", async () => {
    const tokens = await signedIn();
    harness.setTamper(
      onlyAt(
        USERINFO_URL,
        editJson((body) => ({ ...body, sub: "user-2" })),
      ),
    );
    expect(await harness.client.userinfo({ accessToken: tokens.tokens.accessToken, subject: "user-1" })).toEqual(
      failedWith([{ code: "subject_mismatch", path: ["userinfo", "sub"] }]),
    );
  });

  it("fails an access token the provider does not accept with request_failed status 401", async () => {
    expect(await harness.client.userinfo({ accessToken: "never-issued", subject: "user-1" })).toEqual(
      requestFailed({ endpoint: "userinfo", reason: "status", status: 401 }),
    );
  });
});
