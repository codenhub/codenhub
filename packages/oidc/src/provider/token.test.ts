import { createKeySet, createVerifier, generateKeyPair } from "@codenhub/jwt";
import { describe, expect, it } from "vitest";

import { digestKey, randomToken } from "../shared/encoding";
import { MAX_BODY_BYTES } from "../shared/limits";
import { computeCodeChallenge } from "../shared/pkce";
import { computeTokenHash } from "../shared/token-hash";
import { type MemoryStore, createMemoryStore } from "../testing/memory-store";
import { type ResolvedOptions, resolveOptions } from "./options";
import { handleToken } from "./token";
import type { ClientRecord, CodeRecord } from "./types";

const ISSUER = "https://op.example";
const TOKEN_ENDPOINT = `${ISSUER}/token`;
const REDIRECT_URI = "https://app.example/cb";
const VERIFIER = "v".repeat(43);
const NOW_MS = 1_800_000_000_000;
const NOW_SECONDS = NOW_MS / 1000;

interface TokenBody {
  readonly access_token: string;
  readonly token_type: string;
  readonly expires_in: number;
  readonly id_token: string;
  readonly refresh_token?: string;
  readonly scope: string;
}

/** Decodes a token's payload without verifying it. Tests use it only to read claims that other assertions already vouch for. */
const payloadOf = (token: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>;

const CLIENTS: readonly ClientRecord[] = [
  {
    clientId: "public",
    redirectUris: [REDIRECT_URI],
    scopes: ["openid", "profile", "offline_access"],
    auth: { method: "none" },
  },
  { clientId: "other", redirectUris: [REDIRECT_URI], scopes: ["openid"], auth: { method: "none" } },
];

/** Options over a memory store, with a clock the test moves forward by setting `setClock`. */
async function setup(): Promise<{ options: ResolvedOptions; store: MemoryStore; setClock: (ms: number) => void }> {
  let clock = NOW_MS;
  const store = createMemoryStore({ clients: CLIENTS });
  const pair = await generateKeyPair({ alg: "ES256", kid: "k1" });
  const options = resolveOptions({
    issuer: ISSUER,
    signingKeys: [pair],
    store,
    claims: () => ({}),
    now: () => clock,
  });
  return { options, store, setClock: (ms) => (clock = ms) };
}

/** Saves a code as the authorization endpoint would, with defaults a test overrides for one field. */
async function saveCode(store: MemoryStore, overrides: Partial<CodeRecord> = {}): Promise<string> {
  const code = randomToken();
  const record: CodeRecord = {
    grantId: "grant-1",
    clientId: "public",
    redirectUri: REDIRECT_URI,
    codeChallenge: await computeCodeChallenge(VERIFIER),
    nonce: "nonce-1",
    scopes: ["openid", "profile", "offline_access"],
    subject: "user-1",
    authTime: NOW_SECONDS - 30,
    amr: ["pwd"],
    acr: "urn:loa:1",
    maxAgeRequested: false,
    expiresAt: NOW_SECONDS + 60,
    ...overrides,
  };
  await store.saveCode(await digestKey(code), record);
  return code;
}

/** A token request with a form body, as a client sends it. */
function tokenRequest(body: string, contentType = "application/x-www-form-urlencoded"): Request {
  return new Request(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
}

const codeBody = (code: string, overrides: Record<string, string> = {}): string =>
  new URLSearchParams({
    grant_type: "authorization_code",
    client_id: "public",
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: VERIFIER,
    ...overrides,
  }).toString();

const refreshBody = (refreshToken: string, overrides: Record<string, string> = {}): string =>
  new URLSearchParams({
    grant_type: "refresh_token",
    client_id: "public",
    refresh_token: refreshToken,
    ...overrides,
  }).toString();

/** Redeems a fresh code and returns the parsed success body. */
async function redeemCode(
  options: ResolvedOptions,
  store: MemoryStore,
  overrides: Partial<CodeRecord> = {},
): Promise<TokenBody> {
  const code = await saveCode(store, overrides);
  const response = await handleToken(options, tokenRequest(codeBody(code)));
  expect(response.status).toBe(200);
  return (await response.json()) as TokenBody;
}

/** The status and raw body of a failed token response, so the body must match its text exactly. */
async function errorOf(response: Response): Promise<{ readonly status: number; readonly body: string }> {
  return { status: response.status, body: await response.text() };
}

describe("handleToken: transport", () => {
  it("answers a GET with 405 and the allowed methods", async () => {
    const { options } = await setup();

    const response = await handleToken(options, new Request(TOKEN_ENDPOINT, { method: "GET" }));

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST, OPTIONS");
  });

  it("answers a preflight with the POST method allowed", async () => {
    const { options } = await setup();

    const response = await handleToken(options, new Request(TOKEN_ENDPOINT, { method: "OPTIONS" }));

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toBe("POST");
  });

  it("refuses a content type other than form encoding with invalid_request", async () => {
    const { options, store } = await setup();
    const code = await saveCode(store);

    const response = await handleToken(options, tokenRequest(codeBody(code), "text/plain"));

    expect(await errorOf(response)).toEqual({ status: 400, body: JSON.stringify({ error: "invalid_request" }) });
  });

  it("throws TypeError for a request whose body was already read, before any check", async () => {
    const { options } = await setup();
    const request = new Request(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
      }).toString(),
    });
    await request.formData();

    await expect(handleToken(options, request)).rejects.toThrow(TypeError);
  });

  it("exposes the Basic challenge of an invalid_client response to cross-origin browsers", async () => {
    const { options, store } = await setup();
    const code = await saveCode(store);
    const request = new Request(TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${btoa("nobody:secret")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: VERIFIER,
      }).toString(),
    });

    const response = await handleToken(options, request);

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe('Basic realm="token"');
    expect(response.headers.get("access-control-expose-headers")).toBe("WWW-Authenticate");
  });

  it("accepts a form content type with a utf-8 charset, in any case", async () => {
    const { options, store } = await setup();
    const code = await saveCode(store);

    const response = await handleToken(
      options,
      tokenRequest(codeBody(code), "Application/X-WWW-Form-Urlencoded; Charset=UTF-8"),
    );

    expect(response.status).toBe(200);
  });

  it("refuses a duplicated parameter with invalid_request", async () => {
    const { options, store } = await setup();
    const code = await saveCode(store);

    const response = await handleToken(options, tokenRequest(`${codeBody(code)}&grant_type=refresh_token`));

    expect(await errorOf(response)).toEqual({ status: 400, body: JSON.stringify({ error: "invalid_request" }) });
  });

  it("refuses an oversized body with invalid_request", async () => {
    const { options } = await setup();
    const body = `client_id=public&code=${"x".repeat(MAX_BODY_BYTES)}`;

    const response = await handleToken(options, tokenRequest(body));

    expect(await errorOf(response)).toEqual({ status: 400, body: JSON.stringify({ error: "invalid_request" }) });
  });

  it("refuses an unknown grant_type with unsupported_grant_type", async () => {
    const { options } = await setup();

    const response = await handleToken(options, tokenRequest("grant_type=password&client_id=public"));

    expect(await errorOf(response)).toEqual({ status: 400, body: JSON.stringify({ error: "unsupported_grant_type" }) });
  });

  it("refuses a request with no grant_type with invalid_request", async () => {
    const { options } = await setup();

    const response = await handleToken(options, tokenRequest("client_id=public"));

    expect(await errorOf(response)).toEqual({ status: 400, body: JSON.stringify({ error: "invalid_request" }) });
  });
});

describe("handleToken: authorization_code grant", () => {
  it("answers with a no-store JSON body", async () => {
    const { options, store } = await setup();
    const code = await saveCode(store);

    const response = await handleToken(options, tokenRequest(codeBody(code)));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("content-type")).toBe("application/json");
  });

  it("returns a bearer access token with its lifetime and granted scope", async () => {
    const { options, store } = await setup();

    const body = await redeemCode(options, store);

    expect(body.token_type).toBe("Bearer");
    expect(body.expires_in).toBe(options.ttl.accessToken);
    expect(body.scope).toBe("openid profile offline_access");
    expect(body.access_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("issues a refresh token only when offline_access was granted", async () => {
    const { options, store } = await setup();

    const body = await redeemCode(options, store, { scopes: ["openid"] });

    expect(body.refresh_token).toBeUndefined();
  });

  it("returns an ID token that verifies, with the code's authentication context and nonce", async () => {
    const { options, store } = await setup();

    const body = await redeemCode(options, store);
    const verified = await createVerifier({
      keys: createKeySet([options.signingKey.publicKey]),
      issuer: ISSUER,
      audience: "public",
      now: () => NOW_MS,
    })(body.id_token);

    expect(verified.ok && verified.value.payload).toMatchObject({
      iss: ISSUER,
      sub: "user-1",
      aud: "public",
      auth_time: NOW_SECONDS - 30,
      nonce: "nonce-1",
      amr: ["pwd"],
      acr: "urn:loa:1",
    });
  });

  it("binds the ID token to the access token with at_hash", async () => {
    const { options, store } = await setup();

    const body = await redeemCode(options, store);

    expect(payloadOf(body.id_token).at_hash).toBe(await computeTokenHash(body.access_token, "ES256"));
  });

  it("omits nonce from the ID token when the code had none", async () => {
    const { options, store } = await setup();

    const body = await redeemCode(options, store, { nonce: undefined });

    expect(payloadOf(body.id_token)).not.toHaveProperty("nonce");
  });

  it("stores the access token under its digest, tied to the grant", async () => {
    const { options, store } = await setup();

    const body = await redeemCode(options, store);

    expect(await store.findAccessToken(await digestKey(body.access_token))).toMatchObject({
      grantId: "grant-1",
      clientId: "public",
      subject: "user-1",
    });
  });

  it("rejects a wrong code_verifier with invalid_grant", async () => {
    const { options, store } = await setup();
    const code = await saveCode(store);

    const response = await handleToken(options, tokenRequest(codeBody(code, { code_verifier: "w".repeat(43) })));

    expect(await errorOf(response)).toEqual({ status: 400, body: JSON.stringify({ error: "invalid_grant" }) });
    // The code is consumed before its verifier is checked, so the correct verifier no longer redeems it.
    const retry = await handleToken(options, tokenRequest(codeBody(code)));
    expect(await errorOf(retry)).toEqual({ status: 400, body: JSON.stringify({ error: "invalid_grant" }) });
  });

  it("rejects a redirect_uri that differs by a trailing slash with invalid_grant", async () => {
    const { options, store } = await setup();
    const code = await saveCode(store);

    const response = await handleToken(options, tokenRequest(codeBody(code, { redirect_uri: `${REDIRECT_URI}/` })));

    expect(await errorOf(response)).toEqual({ status: 400, body: JSON.stringify({ error: "invalid_grant" }) });
  });

  it("rejects a code redeemed by a client other than the one it was issued to", async () => {
    const { options, store } = await setup();
    const code = await saveCode(store, { clientId: "public" });

    const response = await handleToken(options, tokenRequest(codeBody(code, { client_id: "other" })));

    expect(await errorOf(response)).toEqual({ status: 400, body: JSON.stringify({ error: "invalid_grant" }) });
  });

  it("rejects an expired code with invalid_grant", async () => {
    const { options, store, setClock } = await setup();
    const code = await saveCode(store);
    setClock(NOW_MS + 61_000);

    const response = await handleToken(options, tokenRequest(codeBody(code)));

    expect(await errorOf(response)).toEqual({ status: 400, body: JSON.stringify({ error: "invalid_grant" }) });
  });

  it("rejects an unknown code with invalid_grant", async () => {
    const { options } = await setup();

    const response = await handleToken(options, tokenRequest(codeBody(randomToken())));

    expect(await errorOf(response)).toEqual({ status: 400, body: JSON.stringify({ error: "invalid_grant" }) });
  });

  it("rejects a missing code_verifier with invalid_request", async () => {
    const { options, store } = await setup();
    const code = await saveCode(store);
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: "public",
      code,
      redirect_uri: REDIRECT_URI,
    }).toString();

    const response = await handleToken(options, tokenRequest(body));

    expect(await errorOf(response)).toEqual({ status: 400, body: JSON.stringify({ error: "invalid_request" }) });
  });

  it("rejects a malformed code_verifier with invalid_grant", async () => {
    const { options, store } = await setup();
    const code = await saveCode(store);

    const response = await handleToken(options, tokenRequest(codeBody(code, { code_verifier: "short" })));

    expect(await errorOf(response)).toEqual({ status: 400, body: JSON.stringify({ error: "invalid_grant" }) });
  });

  it("revokes the first redemption's tokens when a code is replayed", async () => {
    const { options, store } = await setup();
    const code = await saveCode(store);
    const first = (await (await handleToken(options, tokenRequest(codeBody(code)))).json()) as TokenBody;
    const accessDigest = await digestKey(first.access_token);
    expect(first.refresh_token).toBeDefined();
    expect(await store.findAccessToken(accessDigest)).toBeDefined();

    const replay = await handleToken(options, tokenRequest(codeBody(code)));

    expect(await errorOf(replay)).toEqual({ status: 400, body: JSON.stringify({ error: "invalid_grant" }) });
    expect(await store.findAccessToken(accessDigest)).toBeUndefined();
    expect(await store.consumeRefreshToken(await digestKey(first.refresh_token ?? ""))).toBeUndefined();
  });

  it("lets exactly one of two concurrent redemptions succeed", async () => {
    const { options, store } = await setup();
    const code = await saveCode(store);

    const [first, second] = await Promise.all([
      handleToken(options, tokenRequest(codeBody(code))),
      handleToken(options, tokenRequest(codeBody(code))),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 400]);
  });
});

describe("handleToken: refresh_token grant", () => {
  it("rotates the refresh token, which then works once more", async () => {
    const { options, store } = await setup();
    const issued = await redeemCode(options, store);

    const rotated = (await (
      await handleToken(options, tokenRequest(refreshBody(issued.refresh_token ?? "")))
    ).json()) as TokenBody;
    const again = await handleToken(options, tokenRequest(refreshBody(rotated.refresh_token ?? "")));

    expect(rotated.refresh_token).not.toBe(issued.refresh_token);
    expect(again.status).toBe(200);
  });

  it("answers a refresh with no-store and an ID token without nonce", async () => {
    const { options, store } = await setup();
    const issued = await redeemCode(options, store);

    const response = await handleToken(options, tokenRequest(refreshBody(issued.refresh_token ?? "")));
    const body = (await response.json()) as TokenBody;

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payloadOf(body.id_token)).not.toHaveProperty("nonce");
  });

  it("revokes the whole family when a rotated refresh token is reused", async () => {
    const { options, store } = await setup();
    const issued = await redeemCode(options, store);
    const rotated = (await (
      await handleToken(options, tokenRequest(refreshBody(issued.refresh_token ?? "")))
    ).json()) as TokenBody;

    const reuse = await handleToken(options, tokenRequest(refreshBody(issued.refresh_token ?? "")));

    expect(await errorOf(reuse)).toEqual({ status: 400, body: JSON.stringify({ error: "invalid_grant" }) });
    const newest = await handleToken(options, tokenRequest(refreshBody(rotated.refresh_token ?? "")));
    expect(newest.status).toBe(400);
    expect(await store.findAccessToken(await digestKey(rotated.access_token))).toBeUndefined();
    expect(await store.findAccessToken(await digestKey(issued.access_token))).toBeUndefined();
  });

  it("narrows the scope of the access token when asked", async () => {
    const { options, store } = await setup();
    const issued = await redeemCode(options, store);

    const response = await handleToken(
      options,
      tokenRequest(refreshBody(issued.refresh_token ?? "", { scope: "openid" })),
    );
    const body = (await response.json()) as TokenBody;

    expect(body.scope).toBe("openid");
    expect(await store.findAccessToken(await digestKey(body.access_token))).toMatchObject({ scopes: ["openid"] });
  });

  it("keeps the family's full scopes after a narrowed refresh", async () => {
    const { options, store } = await setup();
    const issued = await redeemCode(options, store);
    const narrowed = (await (
      await handleToken(options, tokenRequest(refreshBody(issued.refresh_token ?? "", { scope: "openid" })))
    ).json()) as TokenBody;

    const widened = (await (
      await handleToken(options, tokenRequest(refreshBody(narrowed.refresh_token ?? "")))
    ).json()) as TokenBody;

    expect(widened.scope).toBe("openid profile offline_access");
  });

  it("keeps the refresh token usable after a scope the provider does not know", async () => {
    const { options, store } = await setup();
    const issued = await redeemCode(options, store);

    const refused = await handleToken(
      options,
      tokenRequest(refreshBody(issued.refresh_token ?? "", { scope: "openid unknown" })),
    );
    const retried = await handleToken(options, tokenRequest(refreshBody(issued.refresh_token ?? "")));

    expect(await errorOf(refused)).toEqual({ status: 400, body: JSON.stringify({ error: "invalid_scope" }) });
    expect(retried.status).toBe(200);
  });

  it("refuses a refresh scope without openid with invalid_scope and keeps the token usable", async () => {
    const { options, store } = await setup();
    const issued = await redeemCode(options, store);

    const refused = await handleToken(
      options,
      tokenRequest(refreshBody(issued.refresh_token ?? "", { scope: "profile" })),
    );
    const retried = await handleToken(options, tokenRequest(refreshBody(issued.refresh_token ?? "")));

    expect(await errorOf(refused)).toEqual({ status: 400, body: JSON.stringify({ error: "invalid_scope" }) });
    expect(retried.status).toBe(200);
  });

  it("rejects a scope the family does not hold with invalid_scope", async () => {
    const { options, store } = await setup();
    // The family is narrower than the client's registration, so `profile` passes the client check and only
    // the subset check against the family refuses it. A scope the client lacks is refused before consumption.
    const code = await saveCode(store, { scopes: ["openid", "offline_access"] });
    const issued = (await (await handleToken(options, tokenRequest(codeBody(code)))).json()) as TokenBody;

    const response = await handleToken(
      options,
      tokenRequest(refreshBody(issued.refresh_token ?? "", { scope: "openid profile" })),
    );

    expect(await errorOf(response)).toEqual({ status: 400, body: JSON.stringify({ error: "invalid_scope" }) });
    // The token is consumed before the scope subset is checked (scope.md decision 20), so the original fails now.
    const retry = await handleToken(options, tokenRequest(refreshBody(issued.refresh_token ?? "")));
    expect(await errorOf(retry)).toEqual({ status: 400, body: JSON.stringify({ error: "invalid_grant" }) });
  });

  it("does not extend the family's expiry when a token is rotated", async () => {
    const { options, store, setClock } = await setup();
    const issued = await redeemCode(options, store);
    const ttl = options.ttl.refreshToken;
    setClock(NOW_MS + (ttl - 60) * 1000);
    const rotation = await handleToken(options, tokenRequest(refreshBody(issued.refresh_token ?? "")));
    expect(rotation.status).toBe(200);
    const rotated = (await rotation.json()) as TokenBody;
    expect(rotated.refresh_token).toEqual(expect.any(String));

    setClock(NOW_MS + ttl * 1000);
    const response = await handleToken(options, tokenRequest(refreshBody(rotated.refresh_token ?? "")));

    expect(await errorOf(response)).toEqual({ status: 400, body: JSON.stringify({ error: "invalid_grant" }) });
  });

  it("rejects a refresh token presented by another client", async () => {
    const { options, store } = await setup();
    const issued = await redeemCode(options, store);

    const response = await handleToken(
      options,
      tokenRequest(refreshBody(issued.refresh_token ?? "", { client_id: "other" })),
    );

    expect(await errorOf(response)).toEqual({ status: 400, body: JSON.stringify({ error: "invalid_grant" }) });
  });

  it("rejects an unknown refresh token with invalid_grant", async () => {
    const { options } = await setup();

    const response = await handleToken(options, tokenRequest(refreshBody(randomToken())));

    expect(await errorOf(response)).toEqual({ status: 400, body: JSON.stringify({ error: "invalid_grant" }) });
  });

  it("rejects a request with no refresh_token with invalid_request", async () => {
    const { options } = await setup();

    const response = await handleToken(options, tokenRequest("grant_type=refresh_token&client_id=public"));

    expect(await errorOf(response)).toEqual({ status: 400, body: JSON.stringify({ error: "invalid_request" }) });
  });
});
