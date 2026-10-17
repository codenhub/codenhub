import { type KeyPair, generateKeyPair, sign } from "@codenhub/jwt";
import { describe, expect, it } from "vitest";

import { createMemoryStore } from "../testing/memory-store";
import { createProvider } from "./create-provider";
import type { ClientRecord, Provider } from "./types";

const ISSUER = "https://op.example";
const LOGOUT = `${ISSUER}/logout`;
const AFTER_LOGOUT = "https://app.example/signed-out";
const NOW_MS = 1_800_000_000_000;
const NOW_SECONDS = NOW_MS / 1000;

const CLIENTS: readonly ClientRecord[] = [
  {
    clientId: "web",
    redirectUris: ["https://app.example/cb"],
    scopes: ["openid"],
    auth: { method: "none" },
    postLogoutRedirectUris: [AFTER_LOGOUT],
  },
  { clientId: "other", redirectUris: ["https://other.example/cb"], scopes: ["openid"], auth: { method: "none" } },
];

async function setup(): Promise<{ op: Provider; pair: KeyPair }> {
  const pair = await generateKeyPair({ alg: "ES256", kid: "k1" });
  const op = createProvider({
    issuer: ISSUER,
    signingKeys: [pair],
    store: createMemoryStore({ clients: CLIENTS }),
    claims: () => ({}),
    now: () => NOW_MS,
  });
  return { op, pair };
}

/** An ID token as the provider issues it, with `overrides` applied. */
function idToken(pair: KeyPair, overrides: Record<string, unknown> = {}): Promise<string> {
  return sign({
    payload: { iss: ISSUER, sub: "user-1", aud: "web", iat: NOW_SECONDS - 60, exp: NOW_SECONDS + 540, ...overrides },
    key: pair.privateKey,
    header: { typ: "JWT" },
  });
}

const logout = (parameters: Record<string, string>): Request =>
  new Request(`${LOGOUT}?${new URLSearchParams(parameters).toString()}`);

describe("endSession", () => {
  it("names the user and client of a verified hint, and redirects to the registered URI with state", async () => {
    const { op, pair } = await setup();

    const result = await op.endSession(
      logout({
        id_token_hint: await idToken(pair),
        client_id: "web",
        post_logout_redirect_uri: AFTER_LOGOUT,
        state: "s1",
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toMatchObject({ clientId: "web", subject: "user-1" });
    expect(result.value.redirect?.status).toBe(302);
    expect(result.value.redirect?.headers.get("location")).toBe(`${AFTER_LOGOUT}?state=s1`);
    expect(Object.isFrozen(result.value)).toBe(true);
  });

  it("reads a POST form as well as a query", async () => {
    const { op, pair } = await setup();
    const body = new URLSearchParams({ id_token_hint: await idToken(pair), post_logout_redirect_uri: AFTER_LOGOUT });

    const result = await op.endSession(
      new Request(LOGOUT, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      }),
    );

    expect(result.ok && result.value.redirect?.headers.get("location")).toBe(AFTER_LOGOUT);
  });

  it("takes the client from the hint when client_id is absent, and from azp for several audiences", async () => {
    const { op, pair } = await setup();

    const single = await op.endSession(logout({ id_token_hint: await idToken(pair) }));
    const several = await op.endSession(
      logout({ id_token_hint: await idToken(pair, { aud: ["api", "web"], azp: "web" }) }),
    );

    expect(single.ok && single.value).toEqual({ clientId: "web", subject: "user-1", redirect: null });
    expect(several.ok && several.value).toEqual({ clientId: "web", subject: "user-1", redirect: null });
  });

  it("accepts a request with no parameters, naming no one", async () => {
    const { op } = await setup();

    const result = await op.endSession(new Request(LOGOUT));

    expect(result.ok && result.value).toEqual({ redirect: null });
  });

  it.each([
    ["an expired hint", (pair: KeyPair) => idToken(pair, { iat: NOW_SECONDS - 1200, exp: NOW_SECONDS - 600 })],
    ["a hint from another issuer", (pair: KeyPair) => idToken(pair, { iss: "https://evil.example" })],
    ["a hint signed by another key", async () => idToken(await generateKeyPair({ alg: "ES256", kid: "k1" }))],
    ["a hint that is not a JWT", async () => "not-a-jwt"],
  ])("ignores %s, so it names no user, yet still redirects for a client_id", async (_name, build) => {
    const { op, pair } = await setup();

    const result = await op.endSession(
      logout({ id_token_hint: await build(pair), client_id: "web", post_logout_redirect_uri: AFTER_LOGOUT }),
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.subject).toBeUndefined();
    expect(result.ok && result.value.redirect?.headers.get("location")).toBe(AFTER_LOGOUT);
  });

  it("refuses a hint issued to another client than client_id", async () => {
    const { op, pair } = await setup();

    const result = await op.endSession(logout({ id_token_hint: await idToken(pair), client_id: "other" }));

    expect(!result.ok && result.error.issues).toEqual([{ code: "invalid_request", path: ["id_token_hint"] }]);
  });

  it("refuses an unknown client_id", async () => {
    const { op } = await setup();

    const result = await op.endSession(logout({ client_id: "nobody", post_logout_redirect_uri: AFTER_LOGOUT }));

    expect(!result.ok && result.error.issues).toEqual([{ code: "unknown_client" }]);
  });

  it.each([
    ["no client to match it against", { post_logout_redirect_uri: AFTER_LOGOUT }],
    ["a client that registered none", { client_id: "other", post_logout_redirect_uri: AFTER_LOGOUT }],
    ["a trailing slash", { client_id: "web", post_logout_redirect_uri: `${AFTER_LOGOUT}/` }],
    ["a case change", { client_id: "web", post_logout_redirect_uri: AFTER_LOGOUT.toUpperCase() }],
    ["an extra query", { client_id: "web", post_logout_redirect_uri: `${AFTER_LOGOUT}?x=1` }],
    ["another host", { client_id: "web", post_logout_redirect_uri: "https://evil.example/signed-out" }],
  ])("refuses a post_logout_redirect_uri with %s, without redirecting", async (_name, parameters) => {
    const { op } = await setup();

    const result = await op.endSession(logout(parameters));

    expect(!result.ok && result.error.issues).toEqual([
      { code: "invalid_redirect_uri", path: ["post_logout_redirect_uri"] },
    ]);
  });

  it.each([
    ["a duplicate parameter", new Request(`${LOGOUT}?client_id=web&client_id=web`), { reason: "duplicate" }],
    ["invalid UTF-8", new Request(`${LOGOUT}?logout_hint=%E9`), { reason: "malformed" }],
    ["a PUT", new Request(LOGOUT, { method: "PUT" }), undefined],
    ["an oversized URL", new Request(`${LOGOUT}?state=${"a".repeat(8200)}`), undefined],
  ])("refuses %s with invalid_request", async (_name, request, params) => {
    const { op } = await setup();

    const result = await op.endSession(request);

    expect(!result.ok && result.error.issues).toEqual([
      params === undefined ? { code: "invalid_request" } : { code: "invalid_request", params },
    ]);
  });

  it("passes logout_hint and ui_locales through", async () => {
    const { op } = await setup();

    const result = await op.endSession(logout({ logout_hint: "ada@example.com", ui_locales: "pt-BR  en" }));

    expect(result.ok && result.value).toEqual({
      logoutHint: "ada@example.com",
      uiLocales: ["pt-BR", "en"],
      redirect: null,
    });
  });

  it("is advertised in discovery and routed by the app, not by handle", async () => {
    const { op } = await setup();

    expect(op.metadata.end_session_endpoint).toBe(LOGOUT);
    expect(await op.handle(new Request(LOGOUT))).toBeNull();
  });

  it("throws a TypeError for a client record with an unsafe postLogoutRedirectUris entry", async () => {
    const op = createProvider({
      issuer: ISSUER,
      signingKeys: [await generateKeyPair({ alg: "ES256", kid: "k1" })],
      store: createMemoryStore({
        clients: [{ ...(CLIENTS[0] as ClientRecord), postLogoutRedirectUris: ["javascript:alert(1)"] }],
      }),
      claims: () => ({}),
    });

    await expect(op.endSession(logout({ client_id: "web" }))).rejects.toThrow("postLogoutRedirectUris");
  });
});
