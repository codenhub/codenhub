import { generateKeyPair, type KeyPair } from "@codenhub/jwt";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { digestKey } from "../shared/encoding";
import { MAX_BODY_BYTES, MAX_URL_LENGTH } from "../shared/limits";
import { computeCodeChallenge } from "../shared/pkce";
import type { OidcResult } from "../shared/types";
import { createMemoryStore, type MemoryStore } from "../testing/memory-store";
import { beginAuthorization, completeAuthorization } from "./authorization";
import { type ResolvedOptions, resolveOptions } from "./options";
import type { AuthorizationFailure, AuthorizationGrant, AuthorizationInteraction, ClientRecord } from "./types";

const ISSUER = "https://op.example";
const REDIRECT_URI = "https://app.example/cb";
const CLIENT_ID = "app";
const STATE = "state-value-42";
const NOW_MS = 1_800_000_000_000;
const NOW_SECONDS = 1_800_000_000;
const DEFAULT_INTERACTION_TTL = 1800;
const DEFAULT_CODE_TTL = 60;

const client: ClientRecord = {
  clientId: CLIENT_ID,
  redirectUris: [REDIRECT_URI],
  scopes: ["openid", "profile", "email", "offline_access"],
  auth: { method: "none" },
};

let keyPair: KeyPair;
let codeChallenge: string;
let clockMs: number;
let store: MemoryStore;
let options: ResolvedOptions;

beforeAll(async () => {
  keyPair = await generateKeyPair({ alg: "ES256", kid: "k1" });
  codeChallenge = await computeCodeChallenge("a".repeat(43));
});

beforeEach(() => {
  clockMs = NOW_MS;
  store = createMemoryStore({ clients: [client], now: () => clockMs });
  options = resolveOptions({
    issuer: ISSUER,
    signingKeys: [keyPair],
    store,
    claims: () => ({}),
    now: () => clockMs,
  });
});

/** The parameters of a valid request, before any override. */
function baseParameters(): Record<string, string | null> {
  return {
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "openid profile",
    state: STATE,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  };
}

/** A form-encoded query of the valid request, with `overrides` applied; a `null` value removes the parameter. */
function query(overrides: Readonly<Record<string, string | null>> = {}): string {
  const merged = { ...baseParameters(), ...overrides };
  const entries = Object.entries(merged).filter((entry): entry is [string, string] => entry[1] !== null);
  return new URLSearchParams(entries).toString();
}

const getRequest = (search: string): Request => new Request(`${ISSUER}/authorize?${search}`);

const postRequest = (body: string, contentType = "application/x-www-form-urlencoded"): Request =>
  new Request(`${ISSUER}/authorize`, { method: "POST", headers: { "content-type": contentType }, body });

function failureOf(result: OidcResult<unknown, AuthorizationFailure>): AuthorizationFailure {
  if (result.ok) {
    throw new Error("expected the request to fail");
  }
  return result.error;
}

async function beginOk(search = query()): Promise<AuthorizationInteraction> {
  const result = await beginAuthorization(options, getRequest(search));
  if (!result.ok) {
    throw new Error("expected the request to be accepted");
  }
  return result.value;
}

function locationOf(response: Response | null): URL {
  if (response === null) {
    throw new Error("expected a redirect");
  }
  return new URL(response.headers.get("location") ?? "");
}

function expectErrorRedirect(response: Response | null, error: string): void {
  const location = locationOf(response);
  expect(`${location.origin}${location.pathname}`).toBe(REDIRECT_URI);
  expect(location.searchParams.get("error")).toBe(error);
  expect(location.searchParams.get("state")).toBe(STATE);
  expect(location.searchParams.get("iss")).toBe(ISSUER);
  expect(location.href).toContain("iss=https%3A%2F%2Fop.example");
}

const GRANT: AuthorizationGrant = {
  subject: "user-1",
  authTime: NOW_SECONDS,
  scopes: ["openid", "profile"],
};

describe("beginAuthorization", () => {
  describe("accepted requests", () => {
    it("shouldAcceptGetRequest", async () => {
      const result = await beginAuthorization(options, getRequest(query()));
      expect(result.ok).toBe(true);
    });

    it("shouldReturnInteractionFieldsOfGetRequest", async () => {
      const interaction = await beginOk();
      expect(interaction).toMatchObject({
        clientId: CLIENT_ID,
        redirectUri: REDIRECT_URI,
        scopes: ["openid", "profile"],
        prompt: [],
        createdAt: NOW_SECONDS,
      });
      expect(interaction.id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it("shouldAcceptPostFormRequest", async () => {
      const result = await beginAuthorization(options, postRequest(query()));
      expect(result.ok).toBe(true);
    });

    it("shouldAcceptFormContentTypeWithParametersAndUppercase", async () => {
      const result = await beginAuthorization(
        options,
        postRequest(query(), "Application/X-WWW-Form-Urlencoded; charset=UTF-8"),
      );
      expect(result.ok).toBe(true);
    });

    it("shouldReadOnlyTheBodyForPost", async () => {
      const request = new Request(`${ISSUER}/authorize?client_id=someone-else`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: query(),
      });
      const result = await beginAuthorization(options, request);
      expect(result.ok && result.value.clientId).toBe(CLIENT_ID);
    });

    it("shouldSaveInteractionUnderDigestOfIdNotTheId", async () => {
      const saveSpy = vi.spyOn(store, "saveInteraction");
      const interaction = await beginOk();
      expect(saveSpy).toHaveBeenCalledTimes(1);
      const [key, record] = saveSpy.mock.calls[0] ?? [];
      expect(key).toBe(await digestKey(interaction.id));
      expect(key).not.toBe(interaction.id);
      expect(record).toMatchObject({
        clientId: CLIENT_ID,
        redirectUri: REDIRECT_URI,
        state: STATE,
        codeChallenge,
        createdAt: NOW_SECONDS,
        expiresAt: NOW_SECONDS + DEFAULT_INTERACTION_TTL,
      });
    });

    it("shouldOmitOptionalMembersThatAreAbsent", async () => {
      const saveSpy = vi.spyOn(store, "saveInteraction");
      const interaction = await beginOk();
      const [, record] = saveSpy.mock.calls[0] ?? [];
      expect(Object.keys(record ?? {})).not.toContain("nonce");
      expect(Object.keys(record ?? {})).not.toContain("maxAge");
      expect("maxAge" in interaction).toBe(false);
      expect("loginHint" in interaction).toBe(false);
    });

    it("shouldDeduplicateScopesKeepingFirstSeenOrder", async () => {
      const interaction = await beginOk(query({ scope: "profile openid profile" }));
      expect(interaction.scopes).toEqual(["profile", "openid"]);
    });

    it("shouldReturnPromptValuesWhenRequested", async () => {
      const interaction = await beginOk(query({ prompt: "login consent" }));
      expect(interaction.prompt).toEqual(["login", "consent"]);
    });

    it("shouldReturnMaxAgeInSeconds", async () => {
      const interaction = await beginOk(query({ max_age: "300" }));
      expect(interaction.maxAge).toBe(300);
    });

    it("shouldReturnLoginHintAndUiLocales", async () => {
      const interaction = await beginOk(query({ login_hint: "ana@example.test", ui_locales: "fr en" }));
      expect(interaction).toMatchObject({ loginHint: "ana@example.test", uiLocales: ["fr", "en"] });
    });

    it("shouldIgnoreUnknownParameters", async () => {
      const result = await beginAuthorization(
        options,
        getRequest(query({ claims: "{}", id_token_hint: "x", acr_values: "1", display: "page" })),
      );
      expect(result.ok).toBe(true);
    });
  });

  describe("client and redirect URI failures render an error page", () => {
    it("shouldRenderUnknownClientWithoutRedirect", async () => {
      const failure = failureOf(await beginAuthorization(options, getRequest(query({ client_id: "nobody" }))));
      expect(failure.redirect).toBeNull();
      expect(failure.issues).toEqual([{ code: "unknown_client" }]);
    });

    it("shouldRenderMissingClientIdWithPath", async () => {
      const failure = failureOf(await beginAuthorization(options, getRequest(query({ client_id: null }))));
      expect(failure.redirect).toBeNull();
      expect(failure.issues).toEqual([{ code: "invalid_request", path: ["client_id"] }]);
    });

    it.each([
      ["a trailing slash", "https://app.example/cb/"],
      ["an uppercase host", "https://APP.example/cb"],
      ["an extra query parameter", "https://app.example/cb?x=1"],
      ["a fragment", "https://app.example/cb#frag"],
      ["a percent-encoded character", "https://app.example/c%62"],
      ["a different port", "https://app.example:8443/cb"],
      ["http instead of https", "http://app.example/cb"],
      ["a missing redirect_uri", ""],
    ])("shouldRenderInvalidRedirectUriFor%s", async (_name, redirectUri) => {
      const search = redirectUri === "" ? query({ redirect_uri: null }) : query({ redirect_uri: redirectUri });
      const failure = failureOf(await beginAuthorization(options, getRequest(search)));
      expect(failure.redirect).toBeNull();
      expect(failure.issues).toEqual([{ code: "invalid_redirect_uri" }]);
    });
  });

  describe("request-level failures render an error page", () => {
    it("shouldRenderInvalidRequestForDuplicateParameter", async () => {
      const failure = failureOf(await beginAuthorization(options, getRequest(`${query()}&scope=openid`)));
      expect(failure.redirect).toBeNull();
      expect(failure.issues).toEqual([{ code: "invalid_request", params: { reason: "duplicate" } }]);
    });

    it("shouldRenderInvalidRequestForTooManyParameters", async () => {
      const extra = Array.from({ length: 33 }, (_, index) => `x${index}=1`).join("&");
      const failure = failureOf(await beginAuthorization(options, getRequest(`${query()}&${extra}`)));
      expect(failure.issues).toEqual([{ code: "invalid_request", params: { reason: "too_many" } }]);
    });

    it("shouldRenderInvalidRequestForParameterLongerThanLimit", async () => {
      const failure = failureOf(await beginAuthorization(options, getRequest(query({ nonce: "n".repeat(4097) }))));
      expect(failure.issues).toEqual([{ code: "invalid_request", params: { reason: "too_long" } }]);
    });

    it("shouldRenderInvalidRequestForOversizedUrl", async () => {
      const request = getRequest(`${query()}&pad=${"a".repeat(MAX_URL_LENGTH)}`);
      const failure = failureOf(await beginAuthorization(options, request));
      expect(failure.redirect).toBeNull();
      expect(failure.issues).toEqual([{ code: "invalid_request" }]);
    });

    it("shouldRenderInvalidRequestForUnsupportedMethod", async () => {
      const failure = failureOf(
        await beginAuthorization(options, new Request(`${ISSUER}/authorize?${query()}`, { method: "PUT" })),
      );
      expect(failure.redirect).toBeNull();
      expect(failure.issues).toEqual([{ code: "invalid_request" }]);
    });

    it("shouldRenderInvalidRequestForPostWithWrongContentType", async () => {
      const failure = failureOf(await beginAuthorization(options, postRequest(query(), "application/json")));
      expect(failure.issues).toEqual([{ code: "invalid_request" }]);
    });

    it("shouldRenderInvalidRequestForOversizedBody", async () => {
      const failure = failureOf(
        await beginAuthorization(options, postRequest(`${query()}&pad=${"a".repeat(MAX_BODY_BYTES)}`)),
      );
      expect(failure.issues).toEqual([{ code: "invalid_request" }]);
    });
  });

  describe("failures after the client is verified redirect with the error", () => {
    it.each([
      ["a missing PKCE challenge", { code_challenge: null }, "invalid_request", ["code_challenge"]],
      ["a malformed PKCE challenge", { code_challenge: "too-short" }, "invalid_request", ["code_challenge"]],
      ["plain PKCE", { code_challenge_method: "plain" }, "invalid_request", ["code_challenge_method"]],
      ["a missing PKCE method", { code_challenge_method: null }, "invalid_request", ["code_challenge_method"]],
      ["response_type token", { response_type: "token" }, "unsupported_response_type", undefined],
      ["a missing response_type", { response_type: null }, "invalid_request", ["response_type"]],
      ["a response_mode other than query", { response_mode: "fragment" }, "invalid_request", ["response_mode"]],
      ["a scope without openid", { scope: "profile" }, "invalid_scope", undefined],
      ["an unknown scope", { scope: "openid admin" }, "invalid_scope", undefined],
      ["a scope the client may not request", { scope: "openid phone" }, "invalid_scope", undefined],
      ["a double space in scope", { scope: "openid  profile" }, "invalid_scope", undefined],
      ["prompt none with login", { prompt: "none login" }, "invalid_request", ["prompt"]],
      ["an unknown prompt value", { prompt: "maybe" }, "invalid_request", ["prompt"]],
      ["a non-numeric max_age", { max_age: "12abc" }, "invalid_request", ["max_age"]],
      ["a negative max_age", { max_age: "-1" }, "invalid_request", ["max_age"]],
      ["a request object", { request: "eyJhbGciOiJub25lIn0." }, "request_not_supported", undefined],
      ["a request_uri", { request_uri: "https://app.example/req" }, "request_uri_not_supported", undefined],
      ["a registration parameter", { registration: "{}" }, "registration_not_supported", undefined],
    ] as const)("shouldRedirectWithErrorFor%s", async (_name, overrides, error, path) => {
      const failure = failureOf(await beginAuthorization(options, getRequest(query(overrides))));
      expectErrorRedirect(failure.redirect, error);
      expect(failure.issues).toHaveLength(1);
      expect(failure.issues[0]?.code).toBe(error);
      expect(failure.issues[0]?.path).toEqual(path);
    });

    it("shouldOmitStateFromRedirectWhenClientSentNone", async () => {
      const failure = failureOf(
        await beginAuthorization(options, getRequest(query({ state: null, scope: "profile" }))),
      );
      const location = locationOf(failure.redirect);
      expect(location.searchParams.has("state")).toBe(false);
      expect(location.searchParams.get("error")).toBe("invalid_scope");
    });
  });

  describe("issues never hold input values", () => {
    it.each([
      [{ client_id: "intruder-client" }, ["intruder-client"]],
      [{ scope: "openid bogus-scope" }, ["bogus-scope", STATE]],
      [{ redirect_uri: "https://evil.example/cb" }, ["evil.example", STATE]],
      [{ response_type: "token-leak" }, ["token-leak", STATE]],
      [{ code_challenge_method: "plain-leak" }, ["plain-leak", STATE]],
      [{ prompt: "none login" }, [STATE]],
      [{ max_age: "zz-leak" }, ["zz-leak", STATE]],
    ] as const)("shouldKeepInputValuesOutOfIssuesFor%#", async (overrides, forbidden) => {
      const failure = failureOf(await beginAuthorization(options, getRequest(query(overrides))));
      const serialized = JSON.stringify(failure.issues);
      for (const value of [...forbidden, REDIRECT_URI, codeChallenge]) {
        expect(serialized).not.toContain(value);
      }
    });
  });
});

describe("completeAuthorization", () => {
  it("shouldRedirectGrantWithCodeStateAndIssuer", async () => {
    const interaction = await beginOk();
    const result = await completeAuthorization(options, interaction.id, GRANT);
    expect(result.ok).toBe(true);
    const location = locationOf(result.ok ? result.value : null);
    expect(`${location.origin}${location.pathname}`).toBe(REDIRECT_URI);
    expect(location.searchParams.get("code")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(location.searchParams.get("state")).toBe(STATE);
    expect(location.searchParams.get("iss")).toBe(ISSUER);
  });

  it("shouldSaveCodeUnderDigestOfCodeWithGrantFields", async () => {
    const saveSpy = vi.spyOn(store, "saveCode");
    const interaction = await beginOk();
    const result = await completeAuthorization(options, interaction.id, GRANT);
    const code = locationOf(result.ok ? result.value : null).searchParams.get("code") ?? "";
    expect(saveSpy).toHaveBeenCalledWith(
      await digestKey(code),
      expect.objectContaining({
        clientId: CLIENT_ID,
        redirectUri: REDIRECT_URI,
        codeChallenge,
        scopes: ["openid", "profile"],
        subject: "user-1",
        authTime: NOW_SECONDS,
        maxAgeRequested: false,
        expiresAt: NOW_SECONDS + DEFAULT_CODE_TTL,
        grantId: expect.any(String),
      }),
    );
    expect(saveSpy.mock.calls[0]?.[0]).not.toBe(code);
  });

  it("shouldCarryNonceIntoCodeRecord", async () => {
    const saveSpy = vi.spyOn(store, "saveCode");
    const interaction = await beginOk(query({ nonce: "n-0S6_WzA2Mj" }));
    await completeAuthorization(options, interaction.id, GRANT);
    expect(saveSpy.mock.calls[0]?.[1]).toMatchObject({ nonce: "n-0S6_WzA2Mj" });
  });

  it("shouldCarryAmrAndAcrIntoCodeRecord", async () => {
    const saveSpy = vi.spyOn(store, "saveCode");
    const interaction = await beginOk();
    await completeAuthorization(options, interaction.id, { ...GRANT, amr: ["pwd", "otp"], acr: "urn:example:loa2" });
    expect(saveSpy.mock.calls[0]?.[1]).toMatchObject({ amr: ["pwd", "otp"], acr: "urn:example:loa2" });
  });

  it("shouldOmitAmrAndAcrWhenGrantOmitsThem", async () => {
    const saveSpy = vi.spyOn(store, "saveCode");
    const interaction = await beginOk();
    await completeAuthorization(options, interaction.id, GRANT);
    const record = saveSpy.mock.calls[0]?.[1] ?? {};
    expect("amr" in record).toBe(false);
    expect("acr" in record).toBe(false);
    expect("nonce" in record).toBe(false);
  });

  it("shouldSetMaxAgeRequestedWhenMaxAgeWasSent", async () => {
    const saveSpy = vi.spyOn(store, "saveCode");
    const interaction = await beginOk(query({ max_age: "300" }));
    await completeAuthorization(options, interaction.id, GRANT);
    expect(saveSpy.mock.calls[0]?.[1]).toMatchObject({ maxAgeRequested: true });
  });

  it("shouldSaveGrantedScopesDeduplicated", async () => {
    const saveSpy = vi.spyOn(store, "saveCode");
    const interaction = await beginOk();
    await completeAuthorization(options, interaction.id, { ...GRANT, scopes: ["openid", "openid", "profile"] });
    expect(saveSpy.mock.calls[0]?.[1]).toMatchObject({ scopes: ["openid", "profile"] });
  });

  it("shouldRedirectDenialWithErrorAndNoCode", async () => {
    const interaction = await beginOk();
    const result = await completeAuthorization(options, interaction.id, { error: "login_required" });
    expect(result.ok).toBe(true);
    const response = result.ok ? result.value : null;
    expectErrorRedirect(response, "login_required");
    expect(locationOf(response).searchParams.has("code")).toBe(false);
  });

  it("shouldReturnNotFoundWhenInteractionCompletedTwice", async () => {
    const interaction = await beginOk();
    await completeAuthorization(options, interaction.id, GRANT);
    const second = await completeAuthorization(options, interaction.id, GRANT);
    expect(second.ok).toBe(false);
    expect(!second.ok && second.error.issues).toEqual([{ code: "interaction_not_found" }]);
  });

  it("shouldReturnNotFoundForExpiredInteraction", async () => {
    const interaction = await beginOk();
    clockMs += (DEFAULT_INTERACTION_TTL + 1) * 1000;
    const result = await completeAuthorization(options, interaction.id, GRANT);
    expect(!result.ok && result.error.issues).toEqual([{ code: "interaction_not_found" }]);
  });

  it.each([
    ["undefined", undefined],
    ["a number", 42],
    ["an empty string", ""],
    ["an object", {}],
  ])("shouldReturnNotFoundForIdThatIsNotNonEmptyString%s", async (_name, interactionId) => {
    await beginOk();
    const result = await completeAuthorization(options, interactionId, GRANT);
    expect(!result.ok && result.error.issues).toEqual([{ code: "interaction_not_found" }]);
  });

  it("shouldNotConsumeInteractionWhenOutcomeShapeIsInvalid", async () => {
    const interaction = await beginOk();
    await expect(
      completeAuthorization(options, interaction.id, { subject: "", authTime: NOW_SECONDS, scopes: ["openid"] }),
    ).rejects.toThrow(TypeError);
    const result = await completeAuthorization(options, interaction.id, GRANT);
    expect(result.ok).toBe(true);
  });

  it.each([
    ["a scope that was not requested", null, { ...GRANT, scopes: ["openid", "email"] }, "outcome.scopes"],
    ["a grant without openid", null, { ...GRANT, scopes: ["profile"] }, "outcome.scopes"],
    ["an authTime in the future", null, { ...GRANT, authTime: NOW_SECONDS + 1 }, "outcome.authTime"],
    ["an authTime older than max_age", "60", { ...GRANT, authTime: NOW_SECONDS - 61 }, "outcome.authTime"],
  ] as const)("shouldThrowTypeErrorFor%s", async (_name, maxAge, outcome, member) => {
    const interaction = await beginOk(query({ max_age: maxAge }));
    const attempt = completeAuthorization(options, interaction.id, outcome);
    await expect(attempt).rejects.toThrow(TypeError);
    await expect(attempt).rejects.toThrow(member);
  });

  it("shouldThrowTypeErrorForOldAuthTimeUnderPromptLogin", async () => {
    const interaction = await beginOk(query({ prompt: "login" }));
    clockMs += 10_000;
    await expect(
      completeAuthorization(options, interaction.id, { ...GRANT, authTime: NOW_SECONDS - 10 }),
    ).rejects.toThrow("outcome.authTime");
  });

  it("shouldAcceptAuthTimeAtRequestTimeUnderPromptLogin", async () => {
    const interaction = await beginOk(query({ prompt: "login" }));
    const result = await completeAuthorization(options, interaction.id, GRANT);
    expect(result.ok).toBe(true);
  });

  it.each([
    ["a null outcome", null, "outcome"],
    ["a string outcome", "grant", "outcome"],
    ["an empty object", {}, "outcome.subject"],
    ["an unknown denial", { error: "not_a_denial" }, "outcome.error"],
    ["a denial with other members", { error: "access_denied", subject: "user-1" }, "outcome.error"],
    ["an empty subject", { ...GRANT, subject: "" }, "outcome.subject"],
    ["a negative authTime", { ...GRANT, authTime: -1 }, "outcome.authTime"],
    ["a fractional authTime", { ...GRANT, authTime: 1.5 }, "outcome.authTime"],
    ["scopes that are not an array", { ...GRANT, scopes: "openid" }, "outcome.scopes"],
    ["amr that is not an array", { ...GRANT, amr: "pwd" }, "outcome.amr"],
    ["an acr that is not a string", { ...GRANT, acr: 1 }, "outcome.acr"],
  ])("shouldThrowTypeErrorNamingMemberFor%s", async (_name, outcome, member) => {
    const interaction = await beginOk();
    await expect(
      completeAuthorization(options, interaction.id, outcome as unknown as AuthorizationGrant),
    ).rejects.toThrow(member);
  });

  it("shouldNotEchoOutcomeValueInTypeError", async () => {
    const interaction = await beginOk();
    const outcome = { ...GRANT, authTime: "leak-me-authtime" } as unknown as AuthorizationGrant;
    const error = await completeAuthorization(options, interaction.id, outcome).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).not.toContain("leak-me-authtime");
  });
});
