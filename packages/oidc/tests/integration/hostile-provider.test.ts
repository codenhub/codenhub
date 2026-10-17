import { beforeEach, describe, expect, it } from "vitest";

import type { Provider } from "../../src/provider";
import {
  answer,
  authorizationUrl,
  basicHeader,
  beginFailure,
  codeForm,
  CONFIDENTIAL_CLIENT,
  DISCOVERY_URL,
  ISSUER,
  issueCode,
  issueTokens,
  JWKS_URL,
  PUBLIC_CLIENT,
  type ProviderSetup,
  redeem,
  REDIRECT_URI,
  refreshForm,
  setUpProvider,
  STATE,
  summarizeRedirect,
  TOKEN_URL,
  tokenRequest,
  userinfoRequest,
  VERIFIER,
  without,
} from "./provider-support";

/** The status and body of a response, read once. */
async function outcome(response: Response): Promise<{ status: number; body: string }> {
  return { status: response.status, body: await response.text() };
}

/** The status and `www-authenticate` challenge of a response, with its body. */
async function challenged(response: Response): Promise<{ status: number; challenge: string | null; body: string }> {
  return { status: response.status, challenge: response.headers.get("www-authenticate"), body: await response.text() };
}

/** What an authorization request is refused with: its issues, and the redirect it gets, if any. */
async function refusal(provider: Provider, url: string) {
  const failure = await beginFailure(provider, url);
  return { issues: failure.issues, redirect: summarizeRedirect(failure.redirect) };
}

/** The redirect the provider sends for an authorization error, carrying the request's state and issuer. */
const redirectedWith = (error: string) => ({
  status: 302,
  target: REDIRECT_URI,
  params: { error, state: STATE, iss: ISSUER },
});

/** The refresh token of a successful exchange, failing the test when the response carries none. */
function refreshTokenOf(tokens: { readonly refresh_token?: string }): string {
  if (tokens.refresh_token === undefined) {
    throw new Error("the exchange issued no refresh token");
  }
  return tokens.refresh_token;
}

const INVALID_REQUEST = '{"error":"invalid_request"}';
const INVALID_GRANT = '{"error":"invalid_grant"}';

let setup: ProviderSetup;

beforeEach(async () => {
  setup = await setUpProvider();
});

describe("authorization request: PKCE", () => {
  it("refuses a request without code_challenge by redirecting invalid_request", async () => {
    expect(await refusal(setup.provider, authorizationUrl({ code_challenge: null }))).toEqual({
      issues: [{ code: "invalid_request", path: ["code_challenge"] }],
      redirect: redirectedWith("invalid_request"),
    });
  });

  it("refuses code_challenge_method=plain by redirecting invalid_request", async () => {
    expect(await refusal(setup.provider, authorizationUrl({ code_challenge_method: "plain" }))).toEqual({
      issues: [{ code: "invalid_request", path: ["code_challenge_method"] }],
      redirect: redirectedWith("invalid_request"),
    });
  });

  it("refuses a missing code_challenge_method by redirecting invalid_request", async () => {
    expect(await refusal(setup.provider, authorizationUrl({ code_challenge_method: null }))).toEqual({
      issues: [{ code: "invalid_request", path: ["code_challenge_method"] }],
      redirect: redirectedWith("invalid_request"),
    });
  });
});

describe("authorization request: client and redirect URI", () => {
  it("refuses an unknown client_id without a redirect", async () => {
    expect(await refusal(setup.provider, authorizationUrl({ client_id: "nobody" }))).toEqual({
      issues: [{ code: "unknown_client" }],
      redirect: null,
    });
  });

  it.each([
    ["a trailing slash", "https://app.example/cb/"],
    ["an uppercase scheme and host", "HTTPS://APP.EXAMPLE/cb"],
    ["an extra query parameter", "https://app.example/cb?x=1"],
    ["a fragment", "https://app.example/cb#frag"],
    ["a percent-encoded character", "https://app.example/c%62"],
    ["a different port", "https://app.example:8443/cb"],
    ["http instead of https", "http://app.example/cb"],
    ["an empty value", ""],
  ])("refuses a redirect_uri with %s without a redirect", async (_label, redirectUri) => {
    expect(await refusal(setup.provider, authorizationUrl({ redirect_uri: redirectUri }))).toEqual({
      issues: [{ code: "invalid_redirect_uri" }],
      redirect: null,
    });
  });
});

describe("authorization request: parameters and size", () => {
  it("renders invalid_request for a duplicate state parameter", async () => {
    expect(await refusal(setup.provider, `${authorizationUrl()}&state=other`)).toEqual({
      issues: [{ code: "invalid_request", params: { reason: "duplicate" } }],
      redirect: null,
    });
  });

  it("renders invalid_request for 33 parameters", async () => {
    const extra = Object.fromEntries(Array.from({ length: 25 }, (_, index) => [`x${index}`, "1"]));
    expect(await refusal(setup.provider, authorizationUrl(extra))).toEqual({
      issues: [{ code: "invalid_request", params: { reason: "too_many" } }],
      redirect: null,
    });
  });

  it("renders invalid_request for a URL of over 9000 characters", async () => {
    const url = authorizationUrl({ login_hint: "x".repeat(4000), ui_locales: "y".repeat(4000), pad: "z".repeat(1000) });
    expect(url.length).toBeGreaterThanOrEqual(9000);
    expect(await refusal(setup.provider, url)).toEqual({
      issues: [{ code: "invalid_request" }],
      redirect: null,
    });
  });

  it("renders invalid_request for a parameter of 5000 characters", async () => {
    expect(await refusal(setup.provider, authorizationUrl({ login_hint: "h".repeat(5000) }))).toEqual({
      issues: [{ code: "invalid_request", params: { reason: "too_long" } }],
      redirect: null,
    });
  });
});

describe("authorization request: response type, scope, and prompt", () => {
  it("redirects unsupported_response_type for response_type=token", async () => {
    expect(await refusal(setup.provider, authorizationUrl({ response_type: "token" }))).toEqual({
      issues: [{ code: "unsupported_response_type" }],
      redirect: redirectedWith("unsupported_response_type"),
    });
  });

  it("redirects unsupported_response_type for the hybrid response_type 'code id_token'", async () => {
    expect(await refusal(setup.provider, authorizationUrl({ response_type: "code id_token" }))).toEqual({
      issues: [{ code: "unsupported_response_type" }],
      redirect: redirectedWith("unsupported_response_type"),
    });
  });

  it("redirects invalid_scope for a scope without openid", async () => {
    expect(await refusal(setup.provider, authorizationUrl({ scope: "profile" }))).toEqual({
      issues: [{ code: "invalid_scope" }],
      redirect: redirectedWith("invalid_scope"),
    });
  });

  it("redirects invalid_request for prompt=none combined with login", async () => {
    expect(await refusal(setup.provider, authorizationUrl({ prompt: "none login" }))).toEqual({
      issues: [{ code: "invalid_request", path: ["prompt"] }],
      redirect: redirectedWith("invalid_request"),
    });
  });
});

describe("authorization request: every redirect error carries iss and the request state", () => {
  it.each([
    ["missing code_challenge", { code_challenge: null }, "invalid_request"],
    ["plain code_challenge_method", { code_challenge_method: "plain" }, "invalid_request"],
    ["response_type=token", { response_type: "token" }, "unsupported_response_type"],
    ["scope without openid", { scope: "profile" }, "invalid_scope"],
    ["prompt=none login", { prompt: "none login" }, "invalid_request"],
  ])("%s", async (_label, params, error) => {
    const failure = await beginFailure(setup.provider, authorizationUrl(params));
    expect(summarizeRedirect(failure.redirect)?.params).toEqual({ error, state: STATE, iss: ISSUER });
  });
});

describe("authorization request: a valid request", () => {
  it("is saved as an interaction the app can complete", async () => {
    const begun = await setup.provider.beginAuthorization(new Request(authorizationUrl()));
    expect(begun.ok).toBe(true);
    if (!begun.ok) {
      throw new Error("unreachable");
    }
    expect(begun.value).toMatchObject({
      clientId: PUBLIC_CLIENT,
      redirectUri: REDIRECT_URI,
      scopes: ["openid", "profile"],
      prompt: [],
    });
  });
});

describe("token endpoint: request shape", () => {
  it("answers GET with 405 and the methods it allows", async () => {
    const response = await answer(setup.provider, new Request(TOKEN_URL));
    expect({ status: response.status, allow: response.headers.get("allow") }).toEqual({
      status: 405,
      allow: "POST, OPTIONS",
    });
  });

  it("refuses a JSON body with invalid_request", async () => {
    const response = await answer(
      setup.provider,
      tokenRequest(JSON.stringify({ grant_type: "authorization_code" }), { contentType: "application/json" }),
    );
    expect(await outcome(response)).toEqual({ status: 400, body: INVALID_REQUEST });
  });

  it("refuses a body of 20000 bytes with invalid_request", async () => {
    expect(await outcome(await redeem(setup, "a".repeat(20_000)))).toEqual({ status: 400, body: INVALID_REQUEST });
  });

  it("refuses a duplicate code parameter with invalid_request", async () => {
    const issued = await issueCode(setup);
    const form = new URLSearchParams([...Object.entries(codeForm(issued, PUBLIC_CLIENT)), ["code", "other"]]);
    expect(await outcome(await redeem(setup, form.toString()))).toEqual({ status: 400, body: INVALID_REQUEST });
  });
});

describe("token endpoint: authorization code grant", () => {
  it("answers a valid code with 200 and exactly the token response fields", async () => {
    const { response, tokens } = await issueTokens(setup, { scope: "openid profile offline_access" });
    expect({
      status: response.status,
      keys: Object.keys(tokens).sort(),
      tokenType: tokens.token_type,
      expiresIn: tokens.expires_in,
      scope: tokens.scope,
    }).toEqual({
      status: 200,
      keys: ["access_token", "expires_in", "id_token", "refresh_token", "scope", "token_type"],
      tokenType: "Bearer",
      expiresIn: 600,
      scope: "openid profile offline_access",
    });
  });

  it("refuses a wrong code_verifier with invalid_grant", async () => {
    const issued = await issueCode(setup);
    const response = await redeem(setup, codeForm(issued, PUBLIC_CLIENT, { code_verifier: "w".repeat(43) }));
    expect(await outcome(response)).toEqual({ status: 400, body: INVALID_GRANT });
  });

  it("refuses a missing code_verifier from the public client with invalid_request", async () => {
    const issued = await issueCode(setup);
    const response = await redeem(setup, without(codeForm(issued, PUBLIC_CLIENT), "code_verifier"));
    expect(await outcome(response)).toEqual({ status: 400, body: INVALID_REQUEST });
  });

  it("refuses a missing code_verifier from the confidential client with invalid_request", async () => {
    const issued = await issueCode(setup);
    const response = await redeem(setup, without(codeForm(issued, CONFIDENTIAL_CLIENT), "code_verifier"), {
      clientId: CONFIDENTIAL_CLIENT,
      secret: setup.secret,
    });
    expect(await outcome(response)).toEqual({ status: 400, body: INVALID_REQUEST });
  });

  it("refuses a second redemption of a code with invalid_grant", async () => {
    const { code } = await issueTokens(setup);
    expect(await outcome(await redeem(setup, codeForm(code, PUBLIC_CLIENT)))).toEqual({
      status: 400,
      body: INVALID_GRANT,
    });
  });

  it("revokes the access token of the first redemption when its code is replayed", async () => {
    const { code, tokens } = await issueTokens(setup);
    await redeem(setup, codeForm(code, PUBLIC_CLIENT));
    expect(await challenged(await answer(setup.provider, userinfoRequest(tokens.access_token)))).toEqual({
      status: 401,
      challenge: 'Bearer error="invalid_token"',
      body: "",
    });
  });

  it("revokes the refresh token of the first redemption when its code is replayed", async () => {
    const { code, tokens } = await issueTokens(setup);
    await redeem(setup, codeForm(code, PUBLIC_CLIENT));
    expect(await outcome(await redeem(setup, refreshForm(refreshTokenOf(tokens), PUBLIC_CLIENT)))).toEqual({
      status: 400,
      body: INVALID_GRANT,
    });
  });

  it("refuses an expired code with invalid_grant", async () => {
    const issued = await issueCode(setup);
    setup.now.ms += 61_000;
    expect(await outcome(await redeem(setup, codeForm(issued, PUBLIC_CLIENT)))).toEqual({
      status: 400,
      body: INVALID_GRANT,
    });
  });

  it("refuses a code issued to one client when another client redeems it", async () => {
    const issued = await issueCode(setup);
    const response = await redeem(setup, codeForm(issued, CONFIDENTIAL_CLIENT), {
      clientId: CONFIDENTIAL_CLIENT,
      secret: setup.secret,
    });
    expect(await outcome(response)).toEqual({ status: 400, body: INVALID_GRANT });
  });

  it("refuses a redeem with a different redirect_uri with invalid_grant", async () => {
    const issued = await issueCode(setup);
    const response = await redeem(
      setup,
      codeForm(issued, PUBLIC_CLIENT, { redirect_uri: "https://app.example/other" }),
    );
    expect(await outcome(response)).toEqual({ status: 400, body: INVALID_GRANT });
  });

  it("lets exactly one of two concurrent redemptions of a code succeed", async () => {
    const issued = await issueCode(setup);
    const form = codeForm(issued, PUBLIC_CLIENT);
    const responses = await Promise.all([redeem(setup, form), redeem(setup, form)]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
  });
});

describe("token endpoint: refresh token grant", () => {
  it("revokes the family when a refresh token is reused", async () => {
    const { tokens } = await issueTokens(setup);
    const refresh = refreshTokenOf(tokens);
    await redeem(setup, refreshForm(refresh, PUBLIC_CLIENT));
    expect(await outcome(await redeem(setup, refreshForm(refresh, PUBLIC_CLIENT)))).toEqual({
      status: 400,
      body: INVALID_GRANT,
    });
  });

  it("revokes the newest refresh token of the family when a refresh token is reused", async () => {
    const { tokens } = await issueTokens(setup);
    const refresh = refreshTokenOf(tokens);
    const rotated = (await (await redeem(setup, refreshForm(refresh, PUBLIC_CLIENT))).json()) as {
      refresh_token: string;
    };
    await redeem(setup, refreshForm(refresh, PUBLIC_CLIENT));
    expect(await outcome(await redeem(setup, refreshForm(rotated.refresh_token, PUBLIC_CLIENT)))).toEqual({
      status: 400,
      body: INVALID_GRANT,
    });
  });

  it("revokes the access tokens of the family when a refresh token is reused", async () => {
    const { tokens } = await issueTokens(setup);
    const refresh = refreshTokenOf(tokens);
    const rotation = await redeem(setup, refreshForm(refresh, PUBLIC_CLIENT));
    expect(rotation.status).toBe(200);
    const rotated = (await rotation.json()) as { access_token: string };
    expect(rotated.access_token).toEqual(expect.any(String));
    await redeem(setup, refreshForm(refresh, PUBLIC_CLIENT));
    const statuses = [tokens.access_token, rotated.access_token].map(async (token) => {
      return (await answer(setup.provider, userinfoRequest(token))).status;
    });
    expect(await Promise.all(statuses)).toEqual([401, 401]);
  });

  it("lets exactly one of two concurrent refreshes of one token succeed", async () => {
    const { tokens } = await issueTokens(setup);
    const form = refreshForm(refreshTokenOf(tokens), PUBLIC_CLIENT);
    const responses = await Promise.all([redeem(setup, form), redeem(setup, form)]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
  });

  it("refuses a refresh token presented as a code with invalid_grant", async () => {
    const { tokens } = await issueTokens(setup);
    const response = await redeem(setup, {
      grant_type: "authorization_code",
      code: refreshTokenOf(tokens),
      redirect_uri: REDIRECT_URI,
      code_verifier: VERIFIER,
      client_id: PUBLIC_CLIENT,
    });
    expect(await outcome(response)).toEqual({ status: 400, body: INVALID_GRANT });
  });

  it("refuses an access token presented as a refresh token with invalid_grant", async () => {
    const { tokens } = await issueTokens(setup);
    const response = await redeem(setup, refreshForm(tokens.access_token, PUBLIC_CLIENT));
    expect(await outcome(response)).toEqual({ status: 400, body: INVALID_GRANT });
  });
});

describe("token endpoint: client authentication", () => {
  it("refuses a wrong client secret with 401 invalid_client and a Basic challenge", async () => {
    const issued = await issueCode(setup, { params: { client_id: CONFIDENTIAL_CLIENT, scope: "openid profile" } });
    const response = await redeem(setup, codeForm(issued, CONFIDENTIAL_CLIENT), {
      clientId: CONFIDENTIAL_CLIENT,
      secret: "wrong-secret-value",
    });
    expect(await challenged(response)).toEqual({
      status: 401,
      challenge: 'Basic realm="token"',
      body: '{"error":"invalid_client"}',
    });
  });

  it("refuses a public client that sends no verifier with invalid_request", async () => {
    const issued = await issueCode(setup);
    const response = await redeem(setup, without(codeForm(issued, PUBLIC_CLIENT), "code_verifier"));
    expect(await outcome(response)).toEqual({ status: 400, body: INVALID_REQUEST });
  });

  it("refuses a Basic header whose client_id differs from the body client_id with invalid_request", async () => {
    const issued = await issueCode(setup, { params: { client_id: CONFIDENTIAL_CLIENT } });
    const request = tokenRequest(codeForm(issued, PUBLIC_CLIENT), {
      basic: { clientId: CONFIDENTIAL_CLIENT, secret: setup.secret },
    });
    expect(await outcome(await answer(setup.provider, request))).toEqual({ status: 400, body: INVALID_REQUEST });
  });

  it("refuses a Basic header that is not valid base64 with 401 invalid_client", async () => {
    const issued = await issueCode(setup);
    const request = tokenRequest(codeForm(issued, PUBLIC_CLIENT));
    request.headers.set("authorization", "Basic !!not-base64!!");
    expect(await challenged(await answer(setup.provider, request))).toEqual({
      status: 401,
      challenge: 'Basic realm="token"',
      body: '{"error":"invalid_client"}',
    });
  });

  it("accepts the Basic scheme in any letter case", async () => {
    const issued = await issueCode(setup, { params: { client_id: CONFIDENTIAL_CLIENT } });
    const request = tokenRequest(codeForm(issued, CONFIDENTIAL_CLIENT));
    request.headers.set(
      "authorization",
      basicHeader({ clientId: CONFIDENTIAL_CLIENT, secret: setup.secret }).replace("Basic", "bAsIc"),
    );
    expect((await answer(setup.provider, request)).status).toBe(200);
  });
});

describe("userinfo endpoint", () => {
  it("answers a valid access token with the released claims only", async () => {
    const { tokens } = await issueTokens(setup);
    const response = await answer(setup.provider, userinfoRequest(tokens.access_token));
    expect({ status: response.status, body: await response.json() }).toEqual({
      status: 200,
      body: { sub: "user-1", name: "Ada Lovelace" },
    });
  });

  it("refuses an ID token presented as an access token with a Bearer invalid_token challenge", async () => {
    const { tokens } = await issueTokens(setup);
    expect(await challenged(await answer(setup.provider, userinfoRequest(tokens.id_token)))).toEqual({
      status: 401,
      challenge: 'Bearer error="invalid_token"',
      body: "",
    });
  });

  it("refuses a refresh token presented as an access token with a Bearer invalid_token challenge", async () => {
    const { tokens } = await issueTokens(setup);
    expect(await challenged(await answer(setup.provider, userinfoRequest(refreshTokenOf(tokens))))).toEqual({
      status: 401,
      challenge: 'Bearer error="invalid_token"',
      body: "",
    });
  });

  it("refuses an expired access token with a Bearer invalid_token challenge", async () => {
    const { tokens } = await issueTokens(setup);
    setup.now.ms += 601_000;
    expect(await challenged(await answer(setup.provider, userinfoRequest(tokens.access_token)))).toEqual({
      status: 401,
      challenge: 'Bearer error="invalid_token"',
      body: "",
    });
  });
});

describe("HTTP hygiene", () => {
  it("marks a token success and a userinfo success no-store", async () => {
    const { response, tokens } = await issueTokens(setup);
    const userinfo = await answer(setup.provider, userinfoRequest(tokens.access_token));
    expect([response.headers.get("cache-control"), userinfo.headers.get("cache-control")]).toEqual([
      "no-store",
      "no-store",
    ]);
  });

  it("marks a token error no-store", async () => {
    const issued = await issueCode(setup);
    const response = await redeem(setup, codeForm(issued, PUBLIC_CLIENT, { code_verifier: "w".repeat(43) }));
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each([
    ["the token endpoint", async (s: ProviderSetup) => (await issueTokens(s)).response],
    [
      "the userinfo endpoint",
      async (s: ProviderSetup) => {
        const { tokens } = await issueTokens(s);
        return answer(s.provider, userinfoRequest(tokens.access_token));
      },
    ],
    ["the discovery document", (s: ProviderSetup) => answer(s.provider, new Request(DISCOVERY_URL))],
    ["the JWKS", (s: ProviderSetup) => answer(s.provider, new Request(JWKS_URL))],
  ])("allows any origin on %s", async (_label, fetchResponse) => {
    const response = await fetchResponse(setup);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("sends no CORS header on the redirect of a completed authorization", async () => {
    const begun = await setup.provider.beginAuthorization(new Request(authorizationUrl()));
    if (!begun.ok) {
      throw new Error("unreachable");
    }
    const completed = await setup.provider.completeAuthorization(begun.value.id, {
      subject: "user-1",
      authTime: Math.floor(setup.now.ms / 1000),
      scopes: begun.value.scopes,
    });
    if (!completed.ok) {
      throw new Error("unreachable");
    }
    expect(completed.value.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("sends no CORS header on an authorization error redirect", async () => {
    const failure = await beginFailure(setup.provider, authorizationUrl({ response_type: "token" }));
    expect(failure.redirect?.headers.get("access-control-allow-origin")).toBeNull();
  });
});
