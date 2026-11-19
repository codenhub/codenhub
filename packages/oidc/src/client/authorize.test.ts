import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { MAX_URL_LENGTH } from "../shared/limits";
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

/** The error a refused request throws, or `undefined` when it is accepted. */
const refusalOf = async (request: unknown): Promise<unknown> => {
  try {
    await attempt(request);
    return undefined;
  } catch (caught: unknown) {
    return caught;
  }
};

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

  it("sends prompt=create, which asks the provider for its sign-up page", async () => {
    const { url } = await buildAuthorization(resolvedOptions(), { prompt: ["create"] });

    expect(new URL(url).searchParams.get("prompt")).toBe("create");
  });

  it("omits the prompt parameter when none was requested", async () => {
    const { url } = await buildAuthorization(resolvedOptions());

    expect(new URL(url).searchParams.has("prompt")).toBe(false);
  });

  it("sends max_age when one was requested", async () => {
    const { url } = await buildAuthorization(resolvedOptions(), { maxAge: 0 });

    expect(new URL(url).searchParams.get("max_age")).toBe("0");
  });

  it("records max_age and the request time, in whole seconds, in the pending state", async () => {
    const options = { ...resolvedOptions(), now: () => 1_800_000_000_999 };
    const { pending } = await buildAuthorization(options, { maxAge: 300 });

    expect(pending.maxAge).toBe(300);
    expect(pending.requestedAt).toBe(1_800_000_000);
  });

  it("omits maxAge and requestedAt from the pending state when no max_age was requested", async () => {
    const { pending } = await buildAuthorization(resolvedOptions());

    expect(Object.hasOwn(pending, "maxAge")).toBe(false);
    expect(Object.hasOwn(pending, "requestedAt")).toBe(false);
  });

  it("sends login_hint when one was given", async () => {
    const { url } = await buildAuthorization(resolvedOptions(), { loginHint: "ada@example.com" });

    expect(new URL(url).searchParams.get("login_hint")).toBe("ada@example.com");
  });

  it("sends ui_locales joined with spaces", async () => {
    const { url } = await buildAuthorization(resolvedOptions(), { uiLocales: ["pt-BR", "en"] });

    expect(new URL(url).searchParams.get("ui_locales")).toBe("pt-BR en");
  });

  it("sends each resource as a parameter of its own, once, in the order given", async () => {
    const { url } = await buildAuthorization(resolvedOptions(), {
      resource: ["https://api.example", "urn:example:ledger", "https://api.example"],
    });

    expect(new URL(url).searchParams.getAll("resource")).toEqual(["https://api.example", "urn:example:ledger"]);
  });

  it("omits the resource parameter when none was requested", async () => {
    const { url } = await buildAuthorization(resolvedOptions());

    expect(new URL(url).searchParams.has("resource")).toBe(false);
  });

  it("accepts as many resources as the provider reads beside the other parameters", async () => {
    const resource = Array.from({ length: 20 }, (_, index) => `https://api${index}.example`);
    const { url } = await buildAuthorization(resolvedOptions(), {
      scope: ["openid"],
      prompt: ["login"],
      maxAge: 0,
      loginHint: "user",
      uiLocales: ["en"],
      resource,
    });

    // The provider reads at most 32 parameters per request.
    expect([...new URL(url).searchParams]).toHaveLength(32);
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
    const error = await refusalOf({ scope: "openid" });
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toContain("scope");
  });

  it("throws TypeError when scope holds more entries than any request needs", async () => {
    const error = await refusalOf({ scope: ["openid", ...Array.from({ length: 100 }, (_, index) => `s${index}`)] });
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toContain("scope");
  });

  it("throws TypeError when the joined scope is longer than the provider accepts", async () => {
    const error = await refusalOf({ scope: ["openid", "s".repeat(4096)] });
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toContain("scope");
  });

  it("throws TypeError when scope is empty", async () => {
    const error = await refusalOf({ scope: [] });
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toContain("scope");
  });

  it("throws TypeError when scope is sparse", async () => {
    const scope: string[] = ["openid"];
    scope[2] = "profile";
    const error = await refusalOf({ scope });
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toContain("scope");
  });

  it.each(["open id", 'open"id', "open\\id", "openidé"])("throws TypeError for scope token %j", async (token) => {
    const error = await refusalOf({ scope: ["openid", token] });
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toContain("scope");
  });

  it("throws TypeError when scope lacks openid", async () => {
    const error = await refusalOf({ scope: ["profile"] });
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toContain("openid");
  });

  it("throws TypeError when prompt holds an unknown value", async () => {
    const error = await refusalOf({ prompt: ["sometimes"] });
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toContain("prompt");
  });

  it("throws TypeError when prompt is sparse", async () => {
    const prompt: string[] = ["login"];
    prompt[2] = "consent";
    const error = await refusalOf({ prompt });
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toContain("prompt");
  });

  it("throws TypeError when prompt repeats a value", async () => {
    const error = await refusalOf({ prompt: ["login", "login"] });
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toContain("prompt");
  });

  it("throws TypeError when prompt combines none with another value", async () => {
    const error = await refusalOf({ prompt: ["none", "login"] });
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toContain("none");
  });

  it("throws TypeError when maxAge is negative", async () => {
    const error = await refusalOf({ maxAge: -1 });
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toContain("maxAge");
  });

  it("throws TypeError when maxAge is not an integer", async () => {
    const error = await refusalOf({ maxAge: 1.5 });
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toContain("maxAge");
  });

  it("throws TypeError when maxAge exceeds nine digits", async () => {
    const error = await refusalOf({ maxAge: 1000000000 });
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toContain("maxAge");
  });

  it("accepts the largest maxAge the provider reads", async () => {
    const { url } = await buildAuthorization(resolvedOptions(), { maxAge: 999999999 });

    expect(new URL(url).searchParams.get("max_age")).toBe("999999999");
  });

  it("throws TypeError when loginHint is not a string", async () => {
    const error = await refusalOf({ loginHint: 42 });
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toContain("loginHint");
  });

  it("throws TypeError when loginHint is longer than the provider accepts", async () => {
    const error = await refusalOf({ loginHint: "a".repeat(4097) });
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toContain("loginHint");
  });

  it("throws TypeError when loginHint is not well-formed Unicode", async () => {
    const error = await refusalOf({ loginHint: "a\uD800b" });
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toContain("loginHint");
  });

  it("throws TypeError when the encoded URL is longer than the provider reads", async () => {
    const error = await refusalOf({ loginHint: "\u{1F600}".repeat(2048) });
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toContain("8192");
  });

  // The endpoint may be up to MAX_PARAMETER_LENGTH long, so a padded endpoint leaves the request's own parameters
  // room: a login hint of plain letters is copied one for one, and `&login_hint=` adds 12 characters.
  const LOGIN_HINT_OVERHEAD = "&login_hint=".length;
  const paddedEndpoint = `${ISSUER}/authorize?x=${"a".repeat(4000)}`;
  const roomFor = async (): Promise<number> => {
    const { url: base } = await buildAuthorization(resolvedOptions(paddedEndpoint));
    return MAX_URL_LENGTH - base.length - LOGIN_HINT_OVERHEAD;
  };

  it("accepts a request whose URL is exactly at the provider's limit", async () => {
    const hint = "a".repeat(await roomFor());
    const { url } = await buildAuthorization(resolvedOptions(paddedEndpoint), { loginHint: hint });

    expect(url.length).toBe(MAX_URL_LENGTH);
  });

  it("throws TypeError when the URL is one character over the provider's limit", async () => {
    const hint = "a".repeat((await roomFor()) + 1);
    const error = await buildAuthorization(resolvedOptions(paddedEndpoint), { loginHint: hint }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(TypeError);
  });

  it("throws TypeError when uiLocales is not an array", async () => {
    const error = await refusalOf({ uiLocales: "en" });
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toContain("uiLocales");
  });

  it("throws TypeError when uiLocales is sparse", async () => {
    const uiLocales: string[] = ["en"];
    uiLocales[2] = "pt-BR";
    const error = await refusalOf({ uiLocales });
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toContain("uiLocales");
  });

  it("throws TypeError when the joined uiLocales is longer than the provider accepts", async () => {
    const error = await refusalOf({ uiLocales: Array.from({ length: 2000 }, () => "en-US") });
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toContain("uiLocales");
  });

  it.each([["pt BR"], [""], [" en"], ["en\uD800"]])("throws TypeError for ui locale %j", async (locale) => {
    const error = await refusalOf({ uiLocales: [locale] });
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toContain("uiLocales");
  });

  it.each([
    ["not an array", "https://api.example"],
    ["empty", []],
    ["a relative URI", ["/api"]],
    ["a URI with a fragment", ["https://api.example/#part"]],
    ["a URI with a space", ["https://api.example/a b"]],
    ["a URI with a non-ASCII character", ["https://api.example/caf\u00e9"]],
    ["a special scheme without //", ["https:api.example"]],
    ["a special scheme with an empty authority", ["https:///api.example"]],
    ["not a string", [42]],
    ["more entries than the provider reads", Array.from({ length: 21 }, (_, index) => `https://api${index}.example`)],
  ])("throws TypeError when resource is %s", async (_, resource) => {
    const error = await refusalOf({ resource });
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toContain("resource");
  });

  it("throws TypeError when resource is sparse", async () => {
    const resource: string[] = ["https://api.example"];
    resource[2] = "https://other.example";
    const error = await refusalOf({ resource });
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toContain("resource");
  });

  it("throws TypeError when a resource is longer than the provider accepts", async () => {
    const error = await refusalOf({ resource: [`https://api.example/${"a".repeat(4096)}`] });
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toContain("resource");
  });

  it("never names the resource in the TypeError message", async () => {
    const error = await refusalOf({ resource: ["https://api.example/#secret-part"] });
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).not.toContain("secret-part");
  });

  it("uses the resources copied before computeCodeChallenge, not a later mutation of the caller's array", async () => {
    const resource = ["https://api.example"];
    const pending = buildAuthorization(resolvedOptions(), { resource });
    resource[0] = "https://other.example";
    const { url } = await pending;

    expect(new URL(url).searchParams.getAll("resource")).toEqual(["https://api.example"]);
  });

  it("uses the prompt copied before computeCodeChallenge, not a later mutation of the caller's array", async () => {
    const prompt: ("login" | "consent")[] = ["login"];
    const pending = buildAuthorization(resolvedOptions(), { prompt });
    prompt.push("consent");
    const { url } = await pending;

    expect(new URL(url).searchParams.get("prompt")).toBe("login");
  });

  it("uses the ui locales copied before computeCodeChallenge, not a later mutation of the caller's array", async () => {
    const uiLocales = ["pt-BR"];
    const pending = buildAuthorization(resolvedOptions(), { uiLocales });
    uiLocales[0] = "xx-XX";
    const { url } = await pending;

    expect(new URL(url).searchParams.get("ui_locales")).toBe("pt-BR");
  });

  it("names the option but never its value in the TypeError message", async () => {
    const error = await attempt({ loginHint: { email: "ada@example.com" } }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toContain("loginHint");
    expect((error as Error).message).not.toContain("ada@example.com");
  });
});

describe("buildAuthorization: OpenID Connect request options", () => {
  const paramsOf = async (request: AuthorizeOptions) =>
    new URL((await buildAuthorization(resolvedOptions(), request)).url).searchParams;

  it("sends acr_values, display, id_token_hint, claims_locales and claims", async () => {
    const claims = { userinfo: { email: { essential: true } }, id_token: { auth_time: null } };
    const params = await paramsOf({
      acrValues: ["urn:mace:incommon:iap:silver", "phr"],
      display: "popup",
      idTokenHint: "hint.token.value",
      claimsLocales: ["pt-BR", "en"],
      claims,
    });

    expect(params.get("acr_values")).toBe("urn:mace:incommon:iap:silver phr");
    expect(params.get("display")).toBe("popup");
    expect(params.get("id_token_hint")).toBe("hint.token.value");
    expect(params.get("claims_locales")).toBe("pt-BR en");
    expect(JSON.parse(params.get("claims") ?? "")).toEqual(claims);
  });

  it("accepts an id_token_hint longer than one parameter, held only to the URL limit", async () => {
    const params = await paramsOf({ idTokenHint: "h".repeat(5000) });

    expect(params.get("id_token_hint")).toHaveLength(5000);
    await expect(attempt({ idTokenHint: "h".repeat(MAX_URL_LENGTH) })).rejects.toThrow(TypeError);
  });

  it.each([
    ["display that is not a listed value", { display: "fullscreen" }],
    ["acrValues that is not an array", { acrValues: "phr" }],
    ["acrValues with a space", { acrValues: ["a b"] }],
    ["claimsLocales that is empty strings", { claimsLocales: [""] }],
    ["claims that is an array", { claims: [] }],
    ["claims with a function", { claims: { userinfo: () => 1 } }],
    ["claims with a non-finite number", { claims: { n: Number.NaN } }],
    ["claims with a class instance", { claims: { at: new Date(0) } }],
    ["claims nested too deep", { claims: { a: { b: { c: { d: { e: { f: { g: { h: { i: 1 } } } } } } } } } }],
    ["claims longer than a parameter once encoded", { claims: { long: "x".repeat(4096) } }],
    ["idTokenHint that is not a string", { idTokenHint: 1 }],
  ])("throws TypeError for %s", async (_name, request) => {
    await expect(attempt(request)).rejects.toThrow(TypeError);
  });

  it("throws TypeError for a member that is not an option, naming an identifier-like one", async () => {
    await expect(attempt({ login_hint: "user" })).rejects.toThrow("login_hint is not an option");
    const refused = await refusalOf({ "secret value with spaces": 1 });
    expect(refused).toBeInstanceOf(TypeError);
    expect((refused as Error).message).not.toContain("secret value");
  });
});

describe("buildAuthorization: extraParameters", () => {
  it("sends each extra parameter after the client's own", async () => {
    const { url } = await buildAuthorization(resolvedOptions(), {
      extraParameters: { audience: "https://api.example", access_type: "offline" },
    });
    const entries = [...new URL(url).searchParams];

    expect(entries.slice(-2)).toEqual([
      ["audience", "https://api.example"],
      ["access_type", "offline"],
    ]);
  });

  it.each([
    "state",
    "nonce",
    "code_challenge",
    "code_challenge_method",
    "redirect_uri",
    "client_id",
    "response_type",
    "response_mode",
    "scope",
    "prompt",
    "max_age",
    "login_hint",
    "ui_locales",
    "acr_values",
    "display",
    "id_token_hint",
    "claims_locales",
    "claims",
    "resource",
    "request",
    "request_uri",
  ])("throws TypeError for an extra parameter that sets %s", async (name) => {
    const refused = await refusalOf({ extraParameters: { [name]: "attacker-value" } });

    expect(refused).toBeInstanceOf(TypeError);
    expect((refused as Error).message).toContain(name);
    expect((refused as Error).message).not.toContain("attacker-value");
  });

  it.each([
    ["a non-object", "a=b"],
    ["an array", [["a", "b"]]],
    ["an empty value", { a: "" }],
    ["a non-string value", { a: 1 }],
    ["a value longer than a parameter", { a: "v".repeat(4097) }],
    ["a value of ill-formed Unicode", { a: "\uD800" }],
    ["an empty name", { "": "v" }],
  ])("throws TypeError for extraParameters with %s, never echoing the value", async (_name, extraParameters) => {
    const refused = await refusalOf({ extraParameters });

    expect(refused).toBeInstanceOf(TypeError);
    expect((refused as Error).message).not.toContain("vvvv");
  });

  it("counts extra parameters toward the provider's parameter limit", async () => {
    // Eight required parameters leave room for 24 more.
    const fits = Object.fromEntries(Array.from({ length: 24 }, (_, index) => [`x${index}`, "v"]));
    const over = { ...fits, one_more: "v" };

    await expect(attempt({ extraParameters: fits })).resolves.toBeDefined();
    await expect(attempt({ extraParameters: over })).rejects.toThrow("more than 32 parameters");
  });

  it("counts the endpoint's own query toward the parameter limit", async () => {
    const fits = Object.fromEntries(Array.from({ length: 24 }, (_, index) => [`x${index}`, "v"]));
    const options = resolvedOptions(`${ISSUER}/authorize?p=tenant`);

    await expect(buildAuthorization(options, { extraParameters: fits })).rejects.toThrow("more than 32 parameters");
  });

  it("counts extra parameter values toward the URL limit", async () => {
    const extraParameters = { a: "v".repeat(4000), b: "v".repeat(4000), c: "v".repeat(400) };

    await expect(attempt({ extraParameters })).rejects.toThrow(String(MAX_URL_LENGTH));
  });
});

describe("buildAuthorization: response mode", () => {
  it("sends response_mode=form_post and records it in the pending state", async () => {
    const { url, pending } = await buildAuthorization(resolvedOptions(), { responseMode: "form_post" });

    expect(new URL(url).searchParams.get("response_mode")).toBe("form_post");
    expect(pending.responseMode).toBe("form_post");
  });

  it("sends no response_mode for the default query mode", async () => {
    const { url, pending } = await buildAuthorization(resolvedOptions(), { responseMode: "query" });

    expect(new URL(url).searchParams.has("response_mode")).toBe(false);
    expect("responseMode" in pending).toBe(false);
  });

  it("throws TypeError for form_post when the provider lists modes without it, or for an unknown mode", async () => {
    const options = resolveClientOptions({
      metadata: { ...validMetadata(), response_modes_supported: ["query", "fragment"] },
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      auth: { method: "none" },
    });

    await expect(buildAuthorization(options, { responseMode: "form_post" })).rejects.toThrow("form_post");
    await expect(attempt({ responseMode: "fragment" })).rejects.toThrow(TypeError);
  });
});

describe("buildAuthorization: plain OAuth 2.0 client", () => {
  const oauthOptions = (): ResolvedClientOptions =>
    resolveClientOptions({
      openid: false,
      metadata: {
        issuer: "https://github.com",
        authorization_endpoint: "https://github.com/login/oauth/authorize",
        token_endpoint: "https://github.com/login/oauth/access_token",
      },
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      auth: { method: "none" },
    });

  it("sends no nonce and no scope by default, and keeps PKCE", async () => {
    const { url, pending } = await buildAuthorization(oauthOptions());
    const params = new URL(url).searchParams;

    expect(params.has("nonce")).toBe(false);
    expect(params.has("scope")).toBe(false);
    expect(params.get("code_challenge_method")).toBe("S256");
    expect("nonce" in pending).toBe(false);
  });

  it("sends a scope without openid", async () => {
    const { url } = await buildAuthorization(oauthOptions(), { scope: ["read:user", "user:email"] });

    expect(new URL(url).searchParams.get("scope")).toBe("read:user user:email");
  });

  it.each([
    ["maxAge", 0],
    ["idTokenHint", "hint"],
    ["acrValues", ["a"]],
    ["claims", {}],
    ["claimsLocales", ["en"]],
  ])("throws TypeError for %s, which only an OpenID Provider reads", async (name, value) => {
    await expect(buildAuthorization(oauthOptions(), { [name]: value } as AuthorizeOptions)).rejects.toThrow(
      "openid: false",
    );
  });
});
