import { type KeyPair, createKeySet, createVerifier, generateKeyPair } from "@codenhub/jwt";
import { describe, expect, it } from "vitest";

import { digestKey, randomToken } from "../shared/encoding";
import { MAX_BODY_BYTES } from "../shared/limits";
import { computeCodeChallenge } from "../shared/pkce";
import { computeTokenHash } from "../shared/token-hash";
import { type MemoryStore, createMemoryStore } from "../testing/memory-store";
import { reportRefusal } from "./diagnostics";
import { type ResolvedOptions, resolveOptions } from "./options";
import { hashClientSecret } from "./secrets";
import { handleToken } from "./token";
import type { ClientRecord, CodeRecord, ProviderDiagnostic, ProviderOptions } from "./types";
import { handleUserinfo } from "./userinfo";

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

/** Decodes a token's header without verifying it, to see which key signed it. */
const headerOf = (token: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(token.split(".")[0] ?? "", "base64url").toString("utf8")) as Record<string, unknown>;

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
  {
    clientId: "short",
    redirectUris: [REDIRECT_URI],
    scopes: ["openid", "profile", "offline_access"],
    auth: { method: "none" },
    ttl: { accessToken: 120, idToken: 90, refreshToken: 3600 },
  },
  {
    clientId: "partial",
    redirectUris: [REDIRECT_URI],
    scopes: ["openid", "offline_access"],
    auth: { method: "none" },
    ttl: { idToken: 300 },
  },
];

/** Options over a memory store, with a clock the test moves forward by setting `setClock`. */
async function setup(
  extra: {
    readonly keys?: readonly KeyPair[];
    readonly clients?: readonly ClientRecord[];
    readonly onRefresh?: ProviderOptions["onRefresh"];
    readonly claims?: ProviderOptions["claims"];
    readonly scopes?: ProviderOptions["scopes"];
  } = {},
): Promise<{ options: ResolvedOptions; store: MemoryStore; setClock: (ms: number) => void }> {
  let clock = NOW_MS;
  const store = createMemoryStore({ clients: extra.clients ?? CLIENTS });
  const pair = await generateKeyPair({ alg: "ES256", kid: "k1" });
  const options = resolveOptions({
    issuer: ISSUER,
    signingKeys: extra.keys ?? [pair],
    store,
    claims: extra.claims ?? (() => ({})),
    ...(extra.scopes === undefined ? {} : { scopes: extra.scopes }),
    now: () => clock,
    ...(extra.onRefresh === undefined ? {} : { onRefresh: extra.onRefresh }),
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
  if ("codeChallenge" in overrides && overrides.codeChallenge === undefined) {
    // A code issued without a challenge has no such member, rather than an undefined one.
    delete (record as { codeChallenge?: string }).codeChallenge;
  }
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

  it("carries the session id of the code into the ID token as sid and into the stored records", async () => {
    const { options, store } = await setup();

    const body = await redeemCode(options, store, { sessionId: "session-42" });

    expect(payloadOf(body.id_token).sid).toBe("session-42");
    expect(await store.findAccessToken(await digestKey(body.access_token))).toMatchObject({ sessionId: "session-42" });
    expect(await store.consumeRefreshToken(await digestKey(body.refresh_token ?? ""))).toMatchObject({
      record: { sessionId: "session-42" },
    });
  });

  it("omits sid and sessionId when the code has no session id", async () => {
    const { options, store } = await setup();

    const body = await redeemCode(options, store);

    expect(payloadOf(body.id_token)).not.toHaveProperty("sid");
    expect(await store.findAccessToken(await digestKey(body.access_token))).not.toHaveProperty("sessionId");
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

  it("carries the session id through rotation into every ID token and record", async () => {
    const { options, store } = await setup();
    const issued = await redeemCode(options, store, { sessionId: "session-42" });

    const first = (await (
      await handleToken(options, tokenRequest(refreshBody(issued.refresh_token ?? "")))
    ).json()) as TokenBody;
    const second = (await (
      await handleToken(options, tokenRequest(refreshBody(first.refresh_token ?? "")))
    ).json()) as TokenBody;

    expect(payloadOf(first.id_token).sid).toBe("session-42");
    expect(payloadOf(second.id_token).sid).toBe("session-42");
    expect(await store.findAccessToken(await digestKey(second.access_token))).toMatchObject({
      sessionId: "session-42",
    });
  });

  it("keeps sid out of the ID token of a refresh when the family has no session id", async () => {
    const { options, store } = await setup();
    const issued = await redeemCode(options, store);

    const refreshed = (await (
      await handleToken(options, tokenRequest(refreshBody(issued.refresh_token ?? "")))
    ).json()) as TokenBody;

    expect(payloadOf(refreshed.id_token)).not.toHaveProperty("sid");
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

  it("narrows to a scope only the client's record allows, which releases no claims", async () => {
    const { options, store } = await setup({
      clients: [
        {
          clientId: "public",
          redirectUris: [REDIRECT_URI],
          scopes: ["openid", "offline_access", "data:ns:read"],
          auth: { method: "none" },
          idTokenClaims: true,
        },
      ],
      claims: () => ({ name: "Ada Lovelace" }),
    });
    const issued = await redeemCode(options, store, { scopes: ["openid", "offline_access", "data:ns:read"] });

    const response = await handleToken(
      options,
      tokenRequest(refreshBody(issued.refresh_token ?? "", { scope: "openid data:ns:read" })),
    );
    const body = (await response.json()) as TokenBody;

    expect(response.status).toBe(200);
    expect(body.scope).toBe("openid data:ns:read");
    expect(payloadOf(body.id_token)).not.toHaveProperty("name");
  });

  it("refuses a refresh scope that is not a scope token before spending the token", async () => {
    const { options, store } = await setup();
    const issued = await redeemCode(options, store);

    const refused = await handleToken(
      options,
      tokenRequest(refreshBody(issued.refresh_token ?? "", { scope: 'openid say"hi' })),
    );
    const retried = await handleToken(options, tokenRequest(refreshBody(issued.refresh_token ?? "")));

    expect(await errorOf(refused)).toEqual({ status: 400, body: JSON.stringify({ error: "invalid_scope" }) });
    expect(retried.status).toBe(200);
  });

  it("keeps the refresh token usable after a scope the client does not have", async () => {
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

describe("handleToken: the onRefresh re-check", () => {
  it("issues as without the option on true, telling it what the refresh will issue", async () => {
    const seen: unknown[] = [];
    const { options, store } = await setup({
      onRefresh: (request) => {
        seen.push(request);
        return true;
      },
    });
    const issued = await redeemCode(options, store, { sessionId: "session-9" });

    const response = await handleToken(
      options,
      tokenRequest(refreshBody(issued.refresh_token ?? "", { scope: "openid profile" })),
    );

    expect(response.status).toBe(200);
    expect(seen).toEqual([
      {
        subject: "user-1",
        clientId: "public",
        scopes: ["openid", "profile"],
        grantId: "grant-1",
        sessionId: "session-9",
      },
    ]);
    expect(((await response.json()) as TokenBody).refresh_token).toEqual(expect.any(String));
  });

  it("names the family's scopes when the request narrows nothing, and has no sessionId without one", async () => {
    const seen: unknown[] = [];
    const { options, store } = await setup({
      onRefresh: (request) => {
        seen.push(request);
        return true;
      },
    });
    const issued = await redeemCode(options, store);

    await handleToken(options, tokenRequest(refreshBody(issued.refresh_token ?? "")));

    expect(seen).toEqual([
      { subject: "user-1", clientId: "public", scopes: ["openid", "profile", "offline_access"], grantId: "grant-1" },
    ]);
  });

  it("answers invalid_grant on false and ends the whole family", async () => {
    let allow = true;
    const { options, store } = await setup({ onRefresh: () => allow });
    const issued = await redeemCode(options, store);
    const rotated = (await (
      await handleToken(options, tokenRequest(refreshBody(issued.refresh_token ?? "")))
    ).json()) as TokenBody;
    allow = false;

    const refused = await handleToken(options, tokenRequest(refreshBody(rotated.refresh_token ?? "")));

    expect(await errorOf(refused)).toEqual({ status: 400, body: JSON.stringify({ error: "invalid_grant" }) });
    expect(await store.findAccessToken(await digestKey(issued.access_token))).toBeUndefined();
    expect(await store.findAccessToken(await digestKey(rotated.access_token))).toBeUndefined();
    // Even a check that now answers true finds nothing to refresh: the token was consumed and the family is revoked.
    allow = true;
    const retry = await handleToken(options, tokenRequest(refreshBody(rotated.refresh_token ?? "")));
    expect(retry.status).toBe(400);
  });

  it("reports refresh_refused with the client", async () => {
    const seen: ProviderDiagnostic[] = [];
    const { options, store } = await setup({ onRefresh: () => false });
    const issued = await redeemCode(options, store);

    const response = await handleToken(options, tokenRequest(refreshBody(issued.refresh_token ?? "")));
    await reportRefusal((diagnostic) => void seen.push(diagnostic), "token", response);

    expect(seen).toEqual([{ endpoint: "token", status: 400, reason: "refresh_refused", clientId: "public" }]);
  });

  it("awaits an async check that answers true or false", async () => {
    let allow = true;
    const { options, store } = await setup({
      onRefresh: async () => {
        await Promise.resolve();
        return allow;
      },
    });
    const issued = await redeemCode(options, store);
    const accepted = await handleToken(options, tokenRequest(refreshBody(issued.refresh_token ?? "")));
    const next = ((await accepted.json()) as TokenBody).refresh_token ?? "";
    allow = false;

    const refused = await handleToken(options, tokenRequest(refreshBody(next)));

    expect(accepted.status).toBe(200);
    expect(refused.status).toBe(400);
  });

  it("is not called when an earlier check refuses the request", async () => {
    let calls = 0;
    const { options, store } = await setup({
      onRefresh: () => {
        calls += 1;
        return true;
      },
    });
    const issued = await redeemCode(options, store);
    const narrower = await saveCode(store, { scopes: ["openid", "offline_access"] });
    const family = (await (await handleToken(options, tokenRequest(codeBody(narrower)))).json()) as TokenBody;

    await handleToken(options, tokenRequest(refreshBody(randomToken())));
    await handleToken(options, tokenRequest(refreshBody(family.refresh_token ?? "", { scope: "openid profile" })));
    await handleToken(options, tokenRequest(refreshBody(issued.refresh_token ?? "", { client_id: "other" })));
    await handleToken(options, tokenRequest(refreshBody(issued.refresh_token ?? "", { scope: "profile" })));

    expect(calls).toBe(0);
  });

  it.each([undefined, null, "yes", 1, {}])("throws TypeError when the check answers %j", async (answer) => {
    const { options, store } = await setup({ onRefresh: (() => answer) as unknown as () => boolean });
    const issued = await redeemCode(options, store);

    await expect(handleToken(options, tokenRequest(refreshBody(issued.refresh_token ?? "")))).rejects.toThrow(
      TypeError,
    );
  });

  it.each([
    [
      "throw",
      (): boolean => {
        throw new Error("directory down");
      },
    ],
    ["rejection", (): Promise<boolean> => Promise.reject(new Error("directory down"))],
  ])("propagates a %s of the check without revoking the family", async (_name, onRefresh) => {
    const { options, store } = await setup({ onRefresh });
    const issued = await redeemCode(options, store);

    await expect(handleToken(options, tokenRequest(refreshBody(issued.refresh_token ?? "")))).rejects.toThrow(
      "directory down",
    );
    expect(await store.findAccessToken(await digestKey(issued.access_token))).toBeDefined();
  });
});

describe("handleToken: scope claims in the ID token", () => {
  const WITH_CLAIMS: readonly ClientRecord[] = [
    {
      clientId: "public",
      redirectUris: [REDIRECT_URI],
      scopes: ["openid", "profile", "email", "offline_access"],
      auth: { method: "none" },
      idTokenClaims: true,
    },
    {
      clientId: "plain",
      redirectUris: [REDIRECT_URI],
      scopes: ["openid", "profile", "email", "offline_access"],
      auth: { method: "none" },
    },
  ];
  const profileClaims = (): Record<string, unknown> => ({
    name: "Ada Lovelace",
    email: "ada@example.com",
    email_verified: true,
    picture: "https://app.example/ada.png",
  });

  it("leaves the claims out, and never asks for them, when the client has not opted in", async () => {
    let calls = 0;
    const claims = (): Record<string, unknown> => {
      calls += 1;
      return profileClaims();
    };
    const { options, store } = await setup({ clients: WITH_CLAIMS, claims });

    const code = await saveCode(store, { clientId: "plain", scopes: ["openid", "profile", "email"] });
    const response = await handleToken(options, tokenRequest(codeBody(code, { client_id: "plain" })));
    const body = (await response.json()) as TokenBody;

    expect(response.status).toBe(200);
    expect(payloadOf(body.id_token)).not.toHaveProperty("name");
    expect(payloadOf(body.id_token)).not.toHaveProperty("email");
    expect(calls).toBe(0);
  });

  it("carries the claims the granted scopes release, and only those, in the ID token of the code exchange", async () => {
    const seen: unknown[] = [];
    const { options, store } = await setup({
      clients: WITH_CLAIMS,
      claims: (request) => {
        seen.push(request);
        return profileClaims();
      },
    });

    const body = await redeemCode(options, store, { scopes: ["openid", "email"] });

    expect(payloadOf(body.id_token)).toMatchObject({ sub: "user-1", email: "ada@example.com", email_verified: true });
    expect(payloadOf(body.id_token)).not.toHaveProperty("name");
    expect(payloadOf(body.id_token)).not.toHaveProperty("picture");
    expect(seen).toEqual([
      { subject: "user-1", clientId: "public", scopes: ["openid", "email"], claims: ["email", "email_verified"] },
    ]);
  });

  it("still verifies, with the protocol claims intact", async () => {
    const { options, store } = await setup({ clients: WITH_CLAIMS, claims: profileClaims });

    const body = await redeemCode(options, store, { scopes: ["openid", "profile"], sessionId: "session-1" });
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
      nonce: "nonce-1",
      sid: "session-1",
      name: "Ada Lovelace",
      at_hash: await computeTokenHash(body.access_token, "ES256"),
    });
  });

  it("carries them in the ID token of every refresh, for the scopes that refresh issues", async () => {
    const { options, store } = await setup({ clients: WITH_CLAIMS, claims: profileClaims });
    const issued = await redeemCode(options, store, { scopes: ["openid", "profile", "email", "offline_access"] });

    const full = (await (
      await handleToken(options, tokenRequest(refreshBody(issued.refresh_token ?? "")))
    ).json()) as TokenBody;
    const narrowed = (await (
      await handleToken(options, tokenRequest(refreshBody(full.refresh_token ?? "", { scope: "openid email" })))
    ).json()) as TokenBody;

    expect(payloadOf(full.id_token)).toMatchObject({ name: "Ada Lovelace", email: "ada@example.com" });
    expect(payloadOf(narrowed.id_token)).toMatchObject({ email: "ada@example.com" });
    expect(payloadOf(narrowed.id_token)).not.toHaveProperty("name");
  });

  it("drops a claim named like a protocol claim, whatever the callback returns", async () => {
    const hostile = {
      iss: "https://evil.example",
      sub: "someone-else",
      aud: "another-client",
      exp: 1,
      iat: 1,
      auth_time: 1,
      nonce: "forged",
      acr: "forged",
      amr: ["forged"],
      azp: "forged",
      at_hash: "forged",
      c_hash: "forged",
      sid: "forged",
      jti: "forged",
      name: "Ada Lovelace",
    };
    // A scope that names every one of them, so only the protocol rule can be what drops them.
    const { options, store } = await setup({
      clients: [{ ...(WITH_CLAIMS[0] as ClientRecord), scopes: ["openid", "offline_access", "hostile"] }],
      // A scope cannot name `sub`, so the callback's `sub` is the one the provider never reads.
      scopes: { hostile: Object.keys(hostile).filter((name) => name !== "sub") },
      claims: () => hostile,
    });
    const issued = await redeemCode(options, store, {
      scopes: ["openid", "offline_access", "hostile"],
      nonce: undefined,
    });
    const refreshed = (await (
      await handleToken(options, tokenRequest(refreshBody(issued.refresh_token ?? "")))
    ).json()) as TokenBody;

    const atHashes = await Promise.all([issued, refreshed].map((body) => computeTokenHash(body.access_token, "ES256")));

    for (const [index, body] of [issued, refreshed].entries()) {
      const payload = payloadOf(body.id_token);
      expect(payload).toMatchObject({ iss: ISSUER, sub: "user-1", aud: "public", name: "Ada Lovelace" });
      expect(payload.exp).toBe(NOW_SECONDS + options.ttl.idToken);
      expect(payload.iat).toBe(NOW_SECONDS);
      expect(payload.auth_time).toBe(NOW_SECONDS - 30);
      expect(payload.amr).toEqual(["pwd"]);
      expect(payload.acr).toBe("urn:loa:1");
      expect(payload.at_hash).toBe(atHashes[index]);
      for (const name of ["nonce", "azp", "c_hash", "sid", "jti"]) {
        expect(payload).not.toHaveProperty(name);
      }
    }
  });

  it("releases no claims for a scope the provider does not define", async () => {
    let asked: readonly string[] = ["unset"];
    const { options, store } = await setup({
      clients: [{ ...(WITH_CLAIMS[0] as ClientRecord), scopes: ["openid", "data:ns:read"] }],
      claims: (request) => {
        asked = request.claims;
        return profileClaims();
      },
    });

    const body = await redeemCode(options, store, { scopes: ["openid", "data:ns:read"] });

    expect(asked).toEqual([]);
    expect(Object.keys(payloadOf(body.id_token)).sort()).toEqual(
      ["acr", "amr", "at_hash", "aud", "auth_time", "exp", "iat", "iss", "nonce", "sub"].sort(),
    );
  });

  it("rejects with TypeError when the callback resolves to something that is not an object", async () => {
    const { options, store } = await setup({
      clients: WITH_CLAIMS,
      claims: (() => "not an object") as unknown as () => Record<string, unknown>,
    });
    const code = await saveCode(store);

    await expect(handleToken(options, tokenRequest(codeBody(code)))).rejects.toThrow(TypeError);
  });

  it("propagates an error of the callback, as userinfo does", async () => {
    const { options, store } = await setup({
      clients: WITH_CLAIMS,
      claims: () => {
        throw new Error("directory down");
      },
    });
    const code = await saveCode(store);

    await expect(handleToken(options, tokenRequest(codeBody(code)))).rejects.toThrow("directory down");
  });

  it("leaves userinfo as it was", async () => {
    const { options, store } = await setup({ clients: WITH_CLAIMS, claims: profileClaims });

    const body = await redeemCode(options, store, { scopes: ["openid", "email"] });
    const userinfo = await handleUserinfo(
      options,
      new Request(`${ISSUER}/userinfo`, { headers: { authorization: `Bearer ${body.access_token}` } }),
    );

    expect(await userinfo.json()).toEqual({ sub: "user-1", email: "ada@example.com", email_verified: true });
  });
});

describe("handleToken: lifetimes of a client", () => {
  /** Redeems a fresh code issued to `clientId`, and returns the parsed body. */
  async function redeemFor(clientId: string, options: ResolvedOptions, store: MemoryStore): Promise<TokenBody> {
    const code = await saveCode(store, { clientId });
    const response = await handleToken(options, tokenRequest(codeBody(code, { client_id: clientId })));
    expect(response.status).toBe(200);
    return (await response.json()) as TokenBody;
  }

  it("applies the client's own lifetimes to the code exchange", async () => {
    const { options, store } = await setup();

    const body = await redeemFor("short", options, store);

    expect(body.expires_in).toBe(120);
    expect(payloadOf(body.id_token)).toMatchObject({ iat: NOW_SECONDS, exp: NOW_SECONDS + 90 });
    expect(await store.findAccessToken(await digestKey(body.access_token))).toMatchObject({
      expiresAt: NOW_SECONDS + 120,
    });
    expect(await store.consumeRefreshToken(await digestKey(body.refresh_token ?? ""))).toMatchObject({
      record: { expiresAt: NOW_SECONDS + 3600 },
    });
  });

  it("falls back to the provider's lifetime for each one the client leaves out", async () => {
    const { options, store } = await setup();

    const body = await redeemFor("partial", options, store);

    expect(body.expires_in).toBe(options.ttl.accessToken);
    expect(payloadOf(body.id_token).exp).toBe(NOW_SECONDS + 300);
    expect(await store.consumeRefreshToken(await digestKey(body.refresh_token ?? ""))).toMatchObject({
      record: { expiresAt: NOW_SECONDS + options.ttl.refreshToken },
    });
  });

  it("leaves a client without ttl on the provider's lifetimes", async () => {
    const { options, store } = await setup();

    const body = await redeemFor("public", options, store);

    expect(body.expires_in).toBe(options.ttl.accessToken);
    expect(payloadOf(body.id_token).exp).toBe(NOW_SECONDS + options.ttl.idToken);
  });

  it("applies the client's lifetimes to a refresh and keeps the family's expiry through rotation", async () => {
    const { options, store, setClock } = await setup();
    const issued = await redeemFor("short", options, store);
    setClock(NOW_MS + 1000 * 1000);

    const refreshed = (await (
      await handleToken(options, tokenRequest(refreshBody(issued.refresh_token ?? "", { client_id: "short" })))
    ).json()) as TokenBody;

    const now = NOW_SECONDS + 1000;
    expect(refreshed.expires_in).toBe(120);
    expect(payloadOf(refreshed.id_token).exp).toBe(now + 90);
    expect(await store.findAccessToken(await digestKey(refreshed.access_token))).toMatchObject({
      expiresAt: now + 120,
    });
    expect(await store.consumeRefreshToken(await digestKey(refreshed.refresh_token ?? ""))).toMatchObject({
      record: { expiresAt: NOW_SECONDS + 3600 },
    });
  });

  it("refuses a refresh token after the client's shorter family lifetime", async () => {
    const { options, store, setClock } = await setup();
    const issued = await redeemFor("short", options, store);
    setClock(NOW_MS + 3600 * 1000);

    const response = await handleToken(
      options,
      tokenRequest(refreshBody(issued.refresh_token ?? "", { client_id: "short" })),
    );

    expect(await errorOf(response)).toEqual({ status: 400, body: JSON.stringify({ error: "invalid_grant" }) });
  });
});

describe("handleToken: the ID token's signing key", () => {
  const withClient = (overrides: Partial<ClientRecord> = {}): readonly ClientRecord[] => [
    { ...CLIENTS[0], ...overrides } as ClientRecord,
  ];
  const keysOf = async (...algs: readonly ("ES256" | "RS256" | "EdDSA")[]): Promise<readonly KeyPair[]> =>
    Promise.all(algs.map((alg, index) => generateKeyPair({ alg, kid: `${alg}-${index}` })));

  it("signs with the first RS256 key by default, even when another algorithm comes first", async () => {
    const keys = await keysOf("ES256", "RS256", "RS256");
    const { options, store } = await setup({ keys });

    const body = await redeemCode(options, store);

    expect(headerOf(body.id_token)).toMatchObject({ alg: "RS256", kid: "RS256-1" });
    expect(payloadOf(body.id_token).at_hash).toBe(await computeTokenHash(body.access_token, "RS256"));
  });

  it("signs with the first key when no key is RS256", async () => {
    const keys = await keysOf("EdDSA", "ES256");
    const { options, store } = await setup({ keys });

    const body = await redeemCode(options, store);

    expect(headerOf(body.id_token)).toMatchObject({ alg: "EdDSA", kid: "EdDSA-0" });
  });

  it("signs with the first key of the algorithm the client names", async () => {
    const keys = await keysOf("RS256", "ES256", "ES256");
    const { options, store } = await setup({ keys, clients: withClient({ idTokenSigningAlg: "ES256" }) });

    const body = await redeemCode(options, store);

    expect(headerOf(body.id_token)).toMatchObject({ alg: "ES256", kid: "ES256-1" });
    expect(payloadOf(body.id_token).at_hash).toBe(await computeTokenHash(body.access_token, "ES256"));
  });

  it("signs the ID token of a refresh with the same key", async () => {
    const keys = await keysOf("ES256", "RS256");
    const { options, store } = await setup({ keys });
    const issued = await redeemCode(options, store);

    const response = await handleToken(options, tokenRequest(refreshBody(issued.refresh_token ?? "")));
    const refreshed = (await response.json()) as TokenBody;

    expect(headerOf(refreshed.id_token)).toMatchObject({ alg: "RS256", kid: "RS256-1" });
  });

  it("verifies against the published key of that algorithm", async () => {
    const keys = await keysOf("ES256", "RS256");
    const { options, store } = await setup({ keys });

    const body = await redeemCode(options, store);
    const verified = await createVerifier({
      keys: createKeySet(options.publicKeys),
      issuer: ISSUER,
      audience: "public",
      now: () => NOW_MS,
    })(body.id_token);

    expect(verified.ok).toBe(true);
  });

  it("rejects, with TypeError, a client naming an algorithm no signing key has", async () => {
    const keys = await keysOf("ES256");
    const { options } = await setup({ keys, clients: withClient({ idTokenSigningAlg: "RS256" }) });

    await expect(handleToken(options, tokenRequest(codeBody("any-code")))).rejects.toThrow(TypeError);
  });
});

describe("handleToken: PKCE for a client with requirePkce off", () => {
  const SECRET = "s".repeat(43);
  const INVALID_GRANT = { status: 400, body: JSON.stringify({ error: "invalid_grant" }) };
  const INVALID_REQUEST = { status: 400, body: JSON.stringify({ error: "invalid_request" }) };

  /** A confidential client that skips PKCE, and one that keeps the default. */
  async function confidentialClients(): Promise<readonly ClientRecord[]> {
    const base = {
      redirectUris: [REDIRECT_URI],
      scopes: ["openid", "profile", "offline_access"],
      auth: { method: "client_secret_post", secretHashes: [await hashClientSecret(SECRET)] },
    } as const;
    return [
      { clientId: "legacy", ...base, requirePkce: false },
      { clientId: "strict", ...base },
    ];
  }

  const form = (code: string, overrides: Record<string, string> = {}): string =>
    codeBody(code, { client_id: "legacy", client_secret: SECRET, ...overrides });
  const withoutVerifier = (code: string, clientId = "legacy"): string =>
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: SECRET,
      code,
      redirect_uri: REDIRECT_URI,
    }).toString();

  it("redeems a code issued without a challenge when no verifier is sent", async () => {
    const { options, store } = await setup({ clients: await confidentialClients() });
    const code = await saveCode(store, { clientId: "legacy", codeChallenge: undefined });

    const response = await handleToken(options, tokenRequest(withoutVerifier(code)));

    expect(response.status).toBe(200);
    expect(payloadOf(((await response.json()) as TokenBody).id_token).nonce).toBe("nonce-1");
  });

  it("refuses a verifier on a code issued without a challenge, and burns the code", async () => {
    const { options, store } = await setup({ clients: await confidentialClients() });
    const code = await saveCode(store, { clientId: "legacy", codeChallenge: undefined });

    const downgrade = await handleToken(options, tokenRequest(form(code)));
    const retry = await handleToken(options, tokenRequest(withoutVerifier(code)));

    expect(await errorOf(downgrade)).toEqual(INVALID_GRANT);
    // Consumed before the check that needs its record, so even the honest request now finds a replay.
    expect(await errorOf(retry)).toEqual(INVALID_GRANT);
  });

  it("still requires the matching verifier for a code issued with a challenge", async () => {
    const { options, store } = await setup({ clients: await confidentialClients() });
    const right = await saveCode(store, { clientId: "legacy" });
    const wrong = await saveCode(store, { clientId: "legacy" });
    const missing = await saveCode(store, { clientId: "legacy" });

    const responses = await Promise.all([
      handleToken(options, tokenRequest(form(right))),
      handleToken(options, tokenRequest(form(wrong, { code_verifier: "w".repeat(43) }))),
      handleToken(options, tokenRequest(withoutVerifier(missing))),
    ]);

    expect(responses[0]?.status).toBe(200);
    expect(await errorOf(responses[1] as Response)).toEqual(INVALID_GRANT);
    expect(await errorOf(responses[2] as Response)).toEqual(INVALID_GRANT);
  });

  it("refuses a malformed verifier before consuming the code", async () => {
    const { options, store } = await setup({ clients: await confidentialClients() });
    const code = await saveCode(store, { clientId: "legacy", codeChallenge: undefined });

    const malformed = await handleToken(options, tokenRequest(form(code, { code_verifier: "short" })));
    const honest = await handleToken(options, tokenRequest(withoutVerifier(code)));

    expect(await errorOf(malformed)).toEqual(INVALID_GRANT);
    expect(honest.status).toBe(200);
  });

  it("keeps requiring a verifier from a client with the default, before consuming the code", async () => {
    const { options, store } = await setup({ clients: await confidentialClients() });
    const code = await saveCode(store, { clientId: "strict" });

    const missing = await handleToken(options, tokenRequest(withoutVerifier(code, "strict")));
    const redeemed = await handleToken(options, tokenRequest(form(code, { client_id: "strict" })));

    expect(await errorOf(missing)).toEqual(INVALID_REQUEST);
    expect(redeemed.status).toBe(200);
  });

  it("refuses a verifier on a code without a challenge even for a client with the default", async () => {
    const { options, store } = await setup({ clients: await confidentialClients() });
    const code = await saveCode(store, { clientId: "strict", codeChallenge: undefined });

    const response = await handleToken(options, tokenRequest(form(code, { client_id: "strict" })));

    expect(await errorOf(response)).toEqual(INVALID_GRANT);
  });
});
