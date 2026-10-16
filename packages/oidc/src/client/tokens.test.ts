import { describe, expect, it, vi } from "vitest";

import { MAX_RESPONSE_BYTES } from "../shared/limits";
import type { OidcResult } from "../shared/types";
import { resolveClientOptions } from "./options";
import { requestTokens } from "./tokens";
import type { ClientAuth } from "./types";

const ISSUER = "https://op.example";
const TOKEN_URL = `${ISSUER}/token`;
const NOW_MS = 1_800_000_000_000;

const metadata = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/authorize`,
  token_endpoint: TOKEN_URL,
  jwks_uri: `${ISSUER}/jwks`,
  response_types_supported: ["code"],
  subject_types_supported: ["public"],
  id_token_signing_alg_values_supported: ["ES256"],
  token_endpoint_auth_methods_supported: ["none", "client_secret_basic", "client_secret_post"],
};

const options = (fetchFunction: typeof fetch, auth: ClientAuth = { method: "none" }, timeout?: number) =>
  resolveClientOptions({
    metadata,
    clientId: "app",
    redirectUri: "https://app.example/callback",
    auth,
    fetch: fetchFunction,
    timeout,
    now: () => NOW_MS,
  });

const grantForm = (): URLSearchParams =>
  new URLSearchParams({
    grant_type: "authorization_code",
    code: "code-1",
    redirect_uri: "https://app.example/callback",
  });

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const validBody = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  access_token: "at-1",
  token_type: "Bearer",
  ...overrides,
});

/** A stub `fetch` that always answers with the given response, and records its calls. */
const stubFetch = (respond: () => Response | Promise<Response>) =>
  vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => respond());

const issuesOf = (result: OidcResult<unknown>) => {
  if (result.ok) {
    throw new Error("expected a failed result");
  }
  return result.error.issues;
};

describe("requestTokens", () => {
  it("posts the form to the token endpoint as a form body", async () => {
    const stub = stubFetch(() => jsonResponse(validBody()));

    await requestTokens(options(stub), grantForm());

    expect(stub.mock.calls[0]).toMatchObject([
      TOKEN_URL,
      { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" } },
    ]);
    const sent = new URLSearchParams(String(stub.mock.calls[0]?.[1]?.body));
    expect([...sent]).toEqual([
      ["grant_type", "authorization_code"],
      ["code", "code-1"],
      ["redirect_uri", "https://app.example/callback"],
      ["client_id", "app"],
    ]);
  });

  it("sends the credentials the auth method chose", async () => {
    const stub = stubFetch(() => jsonResponse(validBody()));

    await requestTokens(options(stub, { method: "client_secret_basic", secret: "s3cret" }), grantForm());

    expect(stub.mock.calls[0]?.[1]?.headers).toMatchObject({
      authorization: `Basic ${Buffer.from("app:s3cret").toString("base64")}`,
    });
  });

  it("returns the access token and a Bearer token type", async () => {
    const result = await requestTokens(options(stubFetch(() => jsonResponse(validBody()))), grantForm());

    expect(result).toEqual({ ok: true, value: { accessToken: "at-1", tokenType: "Bearer" } });
  });

  it("computes expiresAt from the clock and the lifetime, in whole seconds", async () => {
    const result = await requestTokens(
      options(stubFetch(() => jsonResponse(validBody({ expires_in: 300.9 })))),
      grantForm(),
    );

    expect(result).toMatchObject({ ok: true, value: { expiresAt: NOW_MS / 1000 + 300 } });
  });

  it("omits expiresAt when the provider gives no lifetime", async () => {
    const result = await requestTokens(options(stubFetch(() => jsonResponse(validBody()))), grantForm());

    expect(result.ok && "expiresAt" in result.value).toBe(false);
  });

  it("accepts the token type in any letter case", async () => {
    const result = await requestTokens(
      options(stubFetch(() => jsonResponse(validBody({ token_type: "BEARER" })))),
      grantForm(),
    );

    expect(result.ok).toBe(true);
  });

  it("splits the scope on spaces and drops the empty pieces", async () => {
    const result = await requestTokens(
      options(stubFetch(() => jsonResponse(validBody({ scope: "openid  profile " })))),
      grantForm(),
    );

    expect(result).toMatchObject({ ok: true, value: { scope: ["openid", "profile"] } });
  });

  it("returns the refresh and ID tokens when the provider sends them", async () => {
    const result = await requestTokens(
      options(stubFetch(() => jsonResponse(validBody({ refresh_token: "rt-1", id_token: "a.b.c" })))),
      grantForm(),
    );

    expect(result).toMatchObject({ ok: true, value: { refreshToken: "rt-1", idToken: "a.b.c" } });
  });

  it("reports a missing access_token as an invalid token response", async () => {
    const body = validBody();
    delete body.access_token;

    const issues = issuesOf(await requestTokens(options(stubFetch(() => jsonResponse(body))), grantForm()));

    expect(issues).toEqual([{ code: "invalid_token_response", path: ["response", "access_token"] }]);
  });

  it.each([["tab\there"], ["snow☃man"], ["line\nbreak"], ["\u007f"]])(
    "reports an access token with a non-printable or non-ASCII character %j as an invalid token response",
    async (accessToken) => {
      const issues = issuesOf(
        await requestTokens(
          options(stubFetch(() => jsonResponse(validBody({ access_token: accessToken })))),
          grantForm(),
        ),
      );

      expect(issues).toEqual([{ code: "invalid_token_response", path: ["response", "access_token"] }]);
    },
  );

  it("accepts an access token of printable ASCII, including spaces and symbols", async () => {
    const result = await requestTokens(
      options(stubFetch(() => jsonResponse(validBody({ access_token: "a b~!#$%&'()*+,-./:;<=>?@[]^_`{|}" })))),
      grantForm(),
    );

    expect(result).toMatchObject({ ok: true, value: { accessToken: "a b~!#$%&'()*+,-./:;<=>?@[]^_`{|}" } });
  });

  it("reports a token type other than bearer as an invalid token response", async () => {
    const issues = issuesOf(
      await requestTokens(options(stubFetch(() => jsonResponse(validBody({ token_type: "mac" })))), grantForm()),
    );

    expect(issues).toEqual([{ code: "invalid_token_response", path: ["response", "token_type"] }]);
  });

  it("reports a negative expires_in as an invalid token response", async () => {
    const issues = issuesOf(
      await requestTokens(options(stubFetch(() => jsonResponse(validBody({ expires_in: -1 })))), grantForm()),
    );

    expect(issues).toEqual([{ code: "invalid_token_response", path: ["response", "expires_in"] }]);
  });

  it("collects every invalid member in one result", async () => {
    const issues = issuesOf(
      await requestTokens(
        options(stubFetch(() => jsonResponse({ token_type: "mac", refresh_token: 7, id_token: "" }))),
        grantForm(),
      ),
    );

    expect(issues.map((issue) => issue.path)).toEqual([
      ["response", "access_token"],
      ["response", "token_type"],
      ["response", "refresh_token"],
      ["response", "id_token"],
    ]);
  });

  it("reports a provider error with a known code as provider_error", async () => {
    const issues = issuesOf(
      await requestTokens(options(stubFetch(() => jsonResponse({ error: "invalid_grant" }, 400))), grantForm()),
    );

    expect(issues).toEqual([{ code: "provider_error", params: { endpoint: "token", error: "invalid_grant" } }]);
  });

  it("narrows an unknown provider error to unknown, and keeps its text out of the result", async () => {
    const text = "secret-detail-from-provider";

    const result = await requestTokens(options(stubFetch(() => jsonResponse({ error: text }, 400))), grantForm());

    expect(issuesOf(result)).toEqual([{ code: "provider_error", params: { endpoint: "token", error: "unknown" } }]);
    expect(JSON.stringify(result)).not.toContain(text);
  });

  it("reports a non-200 response without an error member as request_failed with its status", async () => {
    const issues = issuesOf(await requestTokens(options(stubFetch(() => jsonResponse({}, 500))), grantForm()));

    expect(issues).toEqual([{ code: "request_failed", params: { endpoint: "token", reason: "status", status: 500 } }]);
  });

  it("reports a 200 response that is not JSON as request_failed", async () => {
    const issues = issuesOf(
      await requestTokens(
        options(stubFetch(() => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }))),
        grantForm(),
      ),
    );

    expect(issues).toEqual([{ code: "request_failed", params: { endpoint: "token", reason: "content_type" } }]);
  });

  it("reports a body over the size limit as request_failed too_large", async () => {
    const padding = "x".repeat(MAX_RESPONSE_BYTES);
    const body = JSON.stringify({ ...validBody(), padding });

    const issues = issuesOf(
      await requestTokens(
        options(stubFetch(() => new Response(body, { status: 200, headers: { "content-type": "application/json" } }))),
        grantForm(),
      ),
    );

    expect(issues).toEqual([{ code: "request_failed", params: { endpoint: "token", reason: "too_large" } }]);
  });

  it("reports a response that never arrives as request_failed timeout", async () => {
    const hangs = stubFetch(() => new Promise<Response>(() => undefined));

    const issues = issuesOf(await requestTokens(options(hangs, { method: "none" }, 1), grantForm()));

    expect(issues).toEqual([{ code: "request_failed", params: { endpoint: "token", reason: "timeout" } }]);
  });

  it("reports a network failure as request_failed network", async () => {
    const issues = issuesOf(
      await requestTokens(
        options(
          vi.fn(async () => {
            throw new TypeError("fetch failed");
          }),
        ),
        grantForm(),
      ),
    );

    expect(issues).toEqual([{ code: "request_failed", params: { endpoint: "token", reason: "network" } }]);
  });
});
