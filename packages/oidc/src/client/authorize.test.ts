import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { ProviderMetadata } from "../shared/types";
import { buildAuthorization } from "./authorize";
import { resolveClientOptions, type ResolvedClientOptions } from "./options";
import type { AuthorizeOptions, ClientOptions } from "./types";

const ISSUER = "https://login.example.com";
const REDIRECT_URI = "https://app.example.com/callback";
const CLIENT_ID = "client-1";
const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;

const validMetadata = (authorizationEndpoint = `${ISSUER}/authorize`): ProviderMetadata => ({
  issuer: ISSUER,
  authorization_endpoint: authorizationEndpoint,
  token_endpoint: `${ISSUER}/token`,
  jwks_uri: `${ISSUER}/jwks`,
  response_types_supported: ["code"],
  subject_types_supported: ["public"],
  id_token_signing_alg_values_supported: ["ES256"],
});

const resolvedOptions = (authorizationEndpoint?: string): ResolvedClientOptions => {
  const options: ClientOptions = {
    metadata: validMetadata(authorizationEndpoint),
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
    auth: { method: "none" },
  };
  return resolveClientOptions(options);
};

/** The S256 challenge for a verifier, computed with Node's own digest so the test does not reuse the code under test. */
const s256 = (verifier: string): string => createHash("sha256").update(verifier).digest("base64url");

/** Starts an authorization with options that may be invalid, for the tests that expect a TypeError. */
const attempt = (request: unknown): Promise<unknown> =>
  buildAuthorization(resolvedOptions(), request as AuthorizeOptions);

describe("buildAuthorization", () => {
  it("sends exactly the required parameters with openid as the default scope", async () => {
    const { url, pending } = await buildAuthorization(resolvedOptions());

    expect([...new URL(url).searchParams]).toEqual([
      ["response_type", "code"],
      ["client_id", CLIENT_ID],
      ["redirect_uri", REDIRECT_URI],
      ["scope", "openid"],
      ["state", pending.state],
      ["nonce", pending.nonce],
      ["code_challenge", s256(pending.codeVerifier)],
      ["code_challenge_method", "S256"],
    ]);
  });

  it("sends the authorization endpoint as the URL's base", async () => {
    const { url } = await buildAuthorization(resolvedOptions());

    expect(url.startsWith(`${ISSUER}/authorize?`)).toBe(true);
  });

  it("keeps a query the authorization endpoint already has", async () => {
    const { url } = await buildAuthorization(resolvedOptions(`${ISSUER}/authorize?tenant=acme`));

    expect(new URL(url).searchParams.get("tenant")).toBe("acme");
  });

  it("joins the requested scopes with spaces and removes duplicates", async () => {
    const { url } = await buildAuthorization(resolvedOptions(), {
      scope: ["openid", "profile", "email", "profile"],
    });

    expect(new URL(url).searchParams.get("scope")).toBe("openid profile email");
  });

  it("sends the prompt values joined with spaces", async () => {
    const { url } = await buildAuthorization(resolvedOptions(), { prompt: ["login", "consent"] });

    expect(new URL(url).searchParams.get("prompt")).toBe("login consent");
  });

  it("sends none on its own", async () => {
    const { url } = await buildAuthorization(resolvedOptions(), { prompt: ["none"] });

    expect(new URL(url).searchParams.get("prompt")).toBe("none");
  });

  it("omits the prompt parameter when none was requested", async () => {
    const { url } = await buildAuthorization(resolvedOptions());

    expect(new URL(url).searchParams.has("prompt")).toBe(false);
  });

  it("sends max_age when one was requested", async () => {
    const { url } = await buildAuthorization(resolvedOptions(), { maxAge: 0 });

    expect(new URL(url).searchParams.get("max_age")).toBe("0");
  });

  it("records max_age in the pending state when one was requested", async () => {
    const { pending } = await buildAuthorization(resolvedOptions(), { maxAge: 300 });

    expect(pending.maxAge).toBe(300);
  });

  it("omits maxAge from the pending state when none was requested", async () => {
    const { pending } = await buildAuthorization(resolvedOptions());

    expect(Object.hasOwn(pending, "maxAge")).toBe(false);
  });

  it("sends login_hint when one was given", async () => {
    const { url } = await buildAuthorization(resolvedOptions(), { loginHint: "ada@example.com" });

    expect(new URL(url).searchParams.get("login_hint")).toBe("ada@example.com");
  });

  it("sends ui_locales joined with spaces", async () => {
    const { url } = await buildAuthorization(resolvedOptions(), { uiLocales: ["pt-BR", "en"] });

    expect(new URL(url).searchParams.get("ui_locales")).toBe("pt-BR en");
  });

  it("sets the code challenge to the S256 of the code verifier", async () => {
    const { url, pending } = await buildAuthorization(resolvedOptions());

    expect(new URL(url).searchParams.get("code_challenge")).toBe(s256(pending.codeVerifier));
  });

  it("makes a code verifier that RFC 7636 allows", async () => {
    const { pending } = await buildAuthorization(resolvedOptions());

    expect(pending.codeVerifier).toMatch(CODE_VERIFIER_PATTERN);
  });

  it("uses a fresh state for each call", async () => {
    const first = await buildAuthorization(resolvedOptions());
    const second = await buildAuthorization(resolvedOptions());

    expect(second.pending.state).not.toBe(first.pending.state);
  });

  it("uses a fresh nonce for each call", async () => {
    const first = await buildAuthorization(resolvedOptions());
    const second = await buildAuthorization(resolvedOptions());

    expect(second.pending.nonce).not.toBe(first.pending.nonce);
  });

  it("uses a fresh code verifier for each call", async () => {
    const first = await buildAuthorization(resolvedOptions());
    const second = await buildAuthorization(resolvedOptions());

    expect(second.pending.codeVerifier).not.toBe(first.pending.codeVerifier);
  });

  it("returns a pending state that survives a JSON round trip unchanged", async () => {
    const { pending } = await buildAuthorization(resolvedOptions(), { maxAge: 60 });

    expect(JSON.parse(JSON.stringify(pending))).toEqual(pending);
  });

  it("returns a frozen result", async () => {
    const result = await buildAuthorization(resolvedOptions());

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.pending)).toBe(true);
  });

  it("throws TypeError when options is not an object", async () => {
    await expect(attempt(null)).rejects.toThrow(TypeError);
  });

  it("throws TypeError when scope is not an array", async () => {
    await expect(attempt({ scope: "openid" })).rejects.toThrow("scope");
  });

  it("throws TypeError when scope is empty", async () => {
    await expect(attempt({ scope: [] })).rejects.toThrow("scope");
  });

  it.each(["open id", 'open"id', "open\\id", "openidé"])("throws TypeError for scope token %j", async (token) => {
    await expect(attempt({ scope: ["openid", token] })).rejects.toThrow("scope");
  });

  it("throws TypeError when scope lacks openid", async () => {
    await expect(attempt({ scope: ["profile"] })).rejects.toThrow("openid");
  });

  it("throws TypeError when prompt holds an unknown value", async () => {
    await expect(attempt({ prompt: ["sometimes"] })).rejects.toThrow("prompt");
  });

  it("throws TypeError when prompt repeats a value", async () => {
    await expect(attempt({ prompt: ["login", "login"] })).rejects.toThrow("prompt");
  });

  it("throws TypeError when prompt combines none with another value", async () => {
    await expect(attempt({ prompt: ["none", "login"] })).rejects.toThrow("none");
  });

  it("throws TypeError when maxAge is negative", async () => {
    await expect(attempt({ maxAge: -1 })).rejects.toThrow("maxAge");
  });

  it("throws TypeError when maxAge is not an integer", async () => {
    await expect(attempt({ maxAge: 1.5 })).rejects.toThrow("maxAge");
  });

  it("throws TypeError when loginHint is not a string", async () => {
    await expect(attempt({ loginHint: 42 })).rejects.toThrow("loginHint");
  });

  it("throws TypeError when uiLocales is not an array", async () => {
    await expect(attempt({ uiLocales: "en" })).rejects.toThrow("uiLocales");
  });

  it.each([["pt BR"], [""], [" en"]])("throws TypeError for ui locale %j", async (locale) => {
    await expect(attempt({ uiLocales: [locale] })).rejects.toThrow("uiLocales");
  });

  it("names the option but never its value in the TypeError message", async () => {
    const error = await attempt({ loginHint: { email: "ada@example.com" } }).catch((caught: unknown) => caught);

    expect((error as Error).message).toContain("loginHint");
    expect((error as Error).message).not.toContain("ada@example.com");
  });
});
