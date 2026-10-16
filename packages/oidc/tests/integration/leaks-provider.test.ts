import { beforeAll, describe, expect, it } from "vitest";

import { type AuthorizationFailure, createProvider, type OidcStore, type ProviderOptions } from "../../src/provider";
import type { MemoryStore } from "../../src/testing";
import {
  answer,
  authorizationUrl,
  CONFIDENTIAL_CLIENT,
  codeForm,
  DISCOVERY_URL,
  ISSUER,
  issueCode,
  type IssuedCode,
  JWKS_URL,
  NONCE,
  PUBLIC_CLIENT,
  type ProviderSetup,
  redeem,
  REDIRECT_URI,
  refreshForm,
  setUpProvider,
  STATE,
  SUBJECT,
  TOKEN_URL,
  type TokenBody,
  tokenRequest,
  USERINFO_URL,
  userinfoRequest,
  VERIFIER,
  without,
} from "./provider-support";

/*
 * Drives one full authorization code flow and every failure the provider answers, collecting each channel
 * a secret could leak through: the arguments the store receives, every response body and Location, every
 * issue list, and every TypeError message. The assertions then check each channel against the values that
 * must never appear in it.
 */

/** Where a response came from, which decides which values it may carry. */
type Kind =
  /** A token response body: it carries the tokens by design, but never a code, verifier, or secret. */
  | "token-success"
  /** The success redirect: it carries the code by design, but never a token, verifier, or secret. */
  | "success-redirect"
  /** Anything else: it must carry none of the values. */
  | "other";

interface Observed {
  readonly label: string;
  readonly kind: Kind;
  readonly status: number;
  readonly location: string;
  readonly text: string;
}

/** Every value the provider must keep out of every channel, named so a failure says which one leaked. */
type Values = Record<string, string>;

const BAD_CLIENT = "probe-client-LEAKZ";
const BAD_REDIRECT = "https://evil.example/LEAKZ-redirect";
const WRONG_SECRET = "wrong-secret-LEAKZ";

/** Records every argument of every store call, as JSON. */
function recordingStore(): { readonly calls: string[]; readonly wrap: (store: MemoryStore) => OidcStore } {
  const calls: string[] = [];
  return {
    calls,
    wrap: (store) =>
      new Proxy(store, {
        get(target, property) {
          const value: unknown = Reflect.get(target, property);
          if (typeof value !== "function") {
            return value;
          }
          return (...args: unknown[]) => {
            calls.push(JSON.stringify(args));
            return (value as (...values: unknown[]) => unknown).apply(target, args);
          };
        },
      }) as OidcStore,
  };
}

/** The names of the values that appear in `text`. */
function findLeaks(text: string, values: Values): string[] {
  return Object.entries(values)
    .filter(([, value]) => text.includes(value))
    .map(([name]) => name);
}

/** What the provider may carry on one channel, given where that channel's response came from. */
function allowedToLeak(
  kind: Kind,
  values: { readonly never: Values; readonly codes: Values; readonly tokens: Values },
) {
  switch (kind) {
    case "token-success":
      return { ...values.never, ...values.codes };
    case "success-redirect":
      return { ...values.never, ...values.tokens };
    case "other":
      return { ...values.never, ...values.codes, ...values.tokens };
  }
}

/** Runs `run` and describes the error it throws, or says it did not throw. */
async function thrownBy(run: () => unknown): Promise<{ name: string; message: string } | "did not throw"> {
  try {
    await run();
    return "did not throw";
  } catch (error) {
    return error instanceof Error ? { name: error.name, message: error.message } : { name: "", message: String(error) };
  }
}

const seen = {
  responses: [] as Observed[],
  issues: [] as { label: string; text: string }[],
  thrown: [] as { label: string; name: string; message: string }[],
  store: [] as string[],
  never: {} as Values,
  codes: {} as Values,
  tokens: {} as Values,
};

let counter = 0;

/** Remembers the code and interaction of an issued code, so every channel is checked for them. */
function remember(issued: IssuedCode): void {
  counter += 1;
  seen.codes[`authorization code ${counter}`] = issued.code;
  seen.never[`interaction id ${counter}`] = issued.interactionId;
}

/** Remembers the tokens of a token response, so every channel is checked for them. */
function rememberTokens(label: string, tokens: TokenBody): void {
  seen.tokens[`${label} access token`] = tokens.access_token;
  if (tokens.refresh_token !== undefined) {
    seen.tokens[`${label} refresh token`] = tokens.refresh_token;
  }
}

async function observe(label: string, kind: Kind, response: Response): Promise<Observed> {
  const observed: Observed = {
    label,
    kind,
    status: response.status,
    location: response.headers.get("location") ?? "",
    text: await response.text(),
  };
  seen.responses.push(observed);
  return observed;
}

/** Records a refused authorization request: its issue list, and the redirect it carries, if any. */
async function observeRefusal(label: string, failure: AuthorizationFailure): Promise<void> {
  seen.issues.push({ label, text: JSON.stringify(failure.issues) });
  if (failure.redirect !== null) {
    await observe(`${label} redirect`, "other", failure.redirect);
  }
}

/** Runs a valid authorization request up to the success redirect, returning the code and its interaction. */
async function signIn(setup: ProviderSetup, params: Readonly<Record<string, string | null>> = {}): Promise<IssuedCode> {
  const issued = await issueCode(setup, { params });
  remember(issued);
  return issued;
}

/** The tokens of a successful token response, parsed from the body the provider sent. */
function tokensOf(observed: Observed): TokenBody {
  return JSON.parse(observed.text) as TokenBody;
}

function markers(): Values {
  return { ...seen.never, ...seen.codes, ...seen.tokens };
}

let setup: ProviderSetup;
let storeCalls: string[];

beforeAll(async () => {
  const recorder = recordingStore();
  storeCalls = recorder.calls;
  setup = await setUpProvider({ wrapStore: recorder.wrap });
  seen.never["client secret"] = setup.secret;
  seen.never["code verifier"] = VERIFIER;

  // Public documents.
  await observe("discovery", "other", await answer(setup.provider, new Request(DISCOVERY_URL)));
  await observe("jwks", "other", await answer(setup.provider, new Request(JWKS_URL)));

  // The success path, with the redirect observed directly.
  const begun = await setup.provider.beginAuthorization(new Request(authorizationUrl()));
  if (!begun.ok) {
    throw new Error("the valid request was refused");
  }
  seen.never["interaction id 0"] = begun.value.id;
  const completed = await setup.provider.completeAuthorization(begun.value.id, {
    subject: SUBJECT,
    authTime: Math.floor(setup.now.ms / 1000),
    scopes: begun.value.scopes,
    amr: ["pwd"],
  });
  if (!completed.ok) {
    throw new Error("the grant was refused");
  }
  const success = await observe("success redirect", "success-redirect", completed.value);
  const code = new URL(success.location).searchParams.get("code") ?? "";
  seen.codes["authorization code 0"] = code;
  const first: IssuedCode = { code, verifier: VERIFIER, interactionId: begun.value.id, location: success.location };

  const exchanged = await observe(
    "token exchange",
    "token-success",
    await redeem(setup, codeForm(first, PUBLIC_CLIENT)),
  );
  const tokens = tokensOf(exchanged);
  rememberTokens("first", tokens);

  await observe("userinfo", "other", await answer(setup.provider, userinfoRequest(tokens.access_token)));
  const rotated = await observe(
    "refresh rotation",
    "token-success",
    await redeem(setup, refreshForm(tokens.refresh_token ?? "", PUBLIC_CLIENT)),
  );
  rememberTokens("rotated", tokensOf(rotated));

  // Authorization failures, each one a different hostile request.
  const extra = Object.fromEntries(Array.from({ length: 25 }, (_, index) => [`x${index}`, "1"]));
  const refusals: [string, string][] = [
    ["missing code_challenge", authorizationUrl({ code_challenge: null })],
    ["plain code_challenge_method", authorizationUrl({ code_challenge_method: "plain" })],
    ["unknown client", authorizationUrl({ client_id: BAD_CLIENT })],
    ["unregistered redirect_uri", authorizationUrl({ redirect_uri: BAD_REDIRECT })],
    ["duplicate state", `${authorizationUrl()}&state=other-${STATE}`],
    ["33 parameters", authorizationUrl(extra)],
    ["a 5000-character parameter", authorizationUrl({ login_hint: "h".repeat(5000) })],
    ["response_type=token", authorizationUrl({ response_type: "token" })],
    ["scope without openid", authorizationUrl({ scope: "profile" })],
    ["prompt=none login", authorizationUrl({ prompt: "none login" })],
    ["a request object", authorizationUrl({ request: "eyJhbGciOiJub25lIn0.e30." })],
  ];
  await Promise.all(
    refusals.map(async ([label, url]) => {
      const result = await setup.provider.beginAuthorization(new Request(url));
      if (result.ok) {
        throw new Error(`accepted: ${label}`);
      }
      await observeRefusal(label, result.error);
    }),
  );

  // Token endpoint failures.
  const wrongVerifier = await signIn(setup);
  await observe(
    "wrong verifier",
    "other",
    await redeem(setup, codeForm(wrongVerifier, PUBLIC_CLIENT, { code_verifier: "w".repeat(43) })),
  );
  const noVerifier = await signIn(setup);
  await observe(
    "missing verifier",
    "other",
    await redeem(setup, without(codeForm(noVerifier, PUBLIC_CLIENT), "code_verifier")),
  );
  const jsonCode = await signIn(setup);
  await observe(
    "JSON body",
    "other",
    await answer(
      setup.provider,
      tokenRequest(JSON.stringify(codeForm(jsonCode, PUBLIC_CLIENT)), { contentType: "application/json" }),
    ),
  );
  await observe("GET token endpoint", "other", await answer(setup.provider, new Request(TOKEN_URL)));
  await observe("oversized body", "other", await redeem(setup, "a".repeat(20_000)));
  const duplicate = await signIn(setup);
  const duplicateForm = new URLSearchParams([...Object.entries(codeForm(duplicate, PUBLIC_CLIENT)), ["code", "x"]]);
  await observe("duplicate code", "other", await redeem(setup, duplicateForm.toString()));

  const wrongSecretCode = await signIn(setup, { client_id: CONFIDENTIAL_CLIENT, scope: "openid profile" });
  await observe(
    "wrong client secret",
    "other",
    await redeem(setup, codeForm(wrongSecretCode, CONFIDENTIAL_CLIENT), {
      clientId: CONFIDENTIAL_CLIENT,
      secret: WRONG_SECRET,
    }),
  );
  const crossClient = await signIn(setup);
  await observe(
    "code of another client",
    "other",
    await redeem(setup, codeForm(crossClient, CONFIDENTIAL_CLIENT), {
      clientId: CONFIDENTIAL_CLIENT,
      secret: setup.secret,
    }),
  );

  const replayed = await signIn(setup, { scope: "openid profile offline_access" });
  const replayFirst = await observe(
    "code exchange",
    "token-success",
    await redeem(setup, codeForm(replayed, PUBLIC_CLIENT)),
  );
  rememberTokens("replayed", tokensOf(replayFirst));
  await observe("code replay", "other", await redeem(setup, codeForm(replayed, PUBLIC_CLIENT)));
  await observe(
    "refresh token as code",
    "other",
    await redeem(setup, {
      grant_type: "authorization_code",
      code: tokensOf(replayFirst).refresh_token ?? "",
      redirect_uri: REDIRECT_URI,
      code_verifier: VERIFIER,
      client_id: PUBLIC_CLIENT,
    }),
  );
  await observe(
    "access token as refresh token",
    "other",
    await redeem(setup, refreshForm(tokensOf(replayFirst).access_token, PUBLIC_CLIENT)),
  );

  const reused = await observe(
    "refresh exchange",
    "token-success",
    await redeem(setup, refreshForm(tokensOf(replayFirst).refresh_token ?? "", PUBLIC_CLIENT)),
  );
  rememberTokens("reused", tokensOf(reused));
  await observe(
    "refresh reuse",
    "other",
    await redeem(setup, refreshForm(tokensOf(replayFirst).refresh_token ?? "", PUBLIC_CLIENT)),
  );

  const raced = await signIn(setup, { scope: "openid profile offline_access" });
  const racedFirst = await observe(
    "raced exchange",
    "token-success",
    await redeem(setup, codeForm(raced, PUBLIC_CLIENT)),
  );
  const racedTokens = tokensOf(racedFirst);
  rememberTokens("raced", racedTokens);
  const racedForm = refreshForm(racedTokens.refresh_token ?? "", PUBLIC_CLIENT);
  const concurrent = await Promise.all([redeem(setup, racedForm), redeem(setup, racedForm)]);
  await Promise.all(concurrent.map((response, index) => observe(`concurrent refresh ${index}`, "other", response)));

  // Userinfo failures.
  await observe("userinfo without a token", "other", await answer(setup.provider, new Request(USERINFO_URL)));
  await observe(
    "userinfo with a malformed token",
    "other",
    await answer(setup.provider, new Request(USERINFO_URL, { headers: { authorization: "Bearer a b" } })),
  );
  await observe("ID token as access token", "other", await answer(setup.provider, userinfoRequest(tokens.id_token)));
  await observe(
    "refresh token as access token",
    "other",
    await answer(setup.provider, userinfoRequest(tokens.refresh_token ?? "")),
  );

  // Expiry last, because it moves the clock past the lifetimes of everything above.
  const expiring = await signIn(setup);
  setup.now.ms += 61_000;
  await observe("expired code", "other", await redeem(setup, codeForm(expiring, PUBLIC_CLIENT)));
  setup.now.ms += 541_000;
  await observe("expired access token", "other", await answer(setup.provider, userinfoRequest(tokens.access_token)));

  // TypeErrors from bad options, each carrying a secret value where a careless message would echo it.
  const validOptions = { issuer: ISSUER, signingKeys: [setup.signingKey], store: setup.store, claims: () => ({}) };
  const badOptions: [string, Partial<ProviderOptions>][] = [
    ["issuer with a secret in its query", { issuer: `${ISSUER}/?k=${setup.secret}` }],
    ["a ttl that is a secret", { ttl: { code: setup.secret as unknown as number } }],
    ["an endpoint with a verifier in it", { endpoints: { token: `http://op.example/${VERIFIER}` } }],
    ["claims that is a secret", { claims: setup.secret as unknown as ProviderOptions["claims"] }],
    ["scope claims that are a verifier", { scopes: { "read:x": [VERIFIER, 42] as unknown as string[] } }],
    ["now that is a secret", { now: setup.secret as unknown as () => number }],
  ];
  await Promise.all(
    badOptions.map(async ([label, override]) => {
      const result = await thrownBy(() => createProvider({ ...validOptions, ...override } as ProviderOptions));
      seen.thrown.push({ label, ...(result === "did not throw" ? { name: "did not throw", message: "" } : result) });
    }),
  );

  // TypeErrors from bad outcomes.
  const outcomes: [string, unknown][] = [
    ["an outcome that is a secret", setup.secret],
    ["an outcome with a verifier as its scope", { subject: SUBJECT, authTime: 1, scopes: ["openid", VERIFIER] }],
    ["an outcome with a future authTime", { subject: SUBJECT, authTime: 9_999_999_999, scopes: ["openid"] }],
    ["an outcome with a secret as its error", { error: setup.secret }],
  ];
  await Promise.all(
    outcomes.map(async ([label, outcome]) => {
      const fresh = await setup.provider.beginAuthorization(new Request(authorizationUrl()));
      if (!fresh.ok) {
        throw new Error("the valid request was refused");
      }
      seen.never[`interaction id ${label}`] = fresh.value.id;
      const result = await thrownBy(() =>
        setup.provider.completeAuthorization(
          fresh.value.id,
          outcome as Parameters<typeof setup.provider.completeAuthorization>[1],
        ),
      );
      seen.thrown.push({ label, ...(result === "did not throw" ? { name: "did not throw", message: "" } : result) });
    }),
  );

  seen.store = storeCalls;
});

describe("the store", () => {
  it("receives no secret value in any call", () => {
    expect(seen.store.length).toBeGreaterThan(0);
    const leaks = seen.store.flatMap((call, index) =>
      findLeaks(call, markers()).map((name) => `call ${index} carries ${name}`),
    );
    expect(leaks).toEqual([]);
  });
});

describe("response bodies and Location headers", () => {
  it("carries no value outside its allowed channel", () => {
    expect(seen.responses.length).toBeGreaterThan(0);
    const leaks = seen.responses.flatMap((observed) => {
      const allowed = allowedToLeak(observed.kind, { never: seen.never, codes: seen.codes, tokens: seen.tokens });
      return [
        ...findLeaks(observed.text, allowed).map((name) => `${observed.label} body carries ${name}`),
        ...findLeaks(observed.location, allowed).map((name) => `${observed.label} Location carries ${name}`),
      ];
    });
    expect(leaks).toEqual([]);
  });

  it('answers every error with exactly {"error":"<code>"} or an empty body', () => {
    const malformed = seen.responses
      .filter((observed) => observed.status >= 400 && !isExactError(observed.text))
      .map((observed) => observed.label);
    expect(malformed).toEqual([]);
  });
});

/** Tests whether a body is empty or exactly one `error` member holding a string. */
function isExactError(text: string): boolean {
  if (text === "") {
    return true;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      Object.keys(parsed).join(",") === "error" &&
      typeof (parsed as { error: unknown }).error === "string"
    );
  } catch {
    return false;
  }
}

describe("issue lists and TypeError messages", () => {
  it("carries no secret, verifier, state, nonce, client_id, or redirect_uri", () => {
    expect(seen.issues.length + seen.thrown.length).toBeGreaterThan(0);
    const allowed: Values = {
      ...markers(),
      "bad client_id": BAD_CLIENT,
      state: STATE,
      nonce: NONCE,
      "registered redirect_uri": REDIRECT_URI,
      "bad redirect_uri": BAD_REDIRECT,
    };
    const leaks = [
      ...seen.issues.flatMap((issue) => findLeaks(issue.text, allowed).map((name) => `${issue.label} carries ${name}`)),
      ...seen.thrown.flatMap((error) =>
        findLeaks(error.message, allowed).map((name) => `${error.label} message carries ${name}`),
      ),
    ];
    expect(leaks).toEqual([]);
  });

  it("throws TypeError for every bad option and bad outcome", () => {
    expect(seen.thrown).toHaveLength(10);
    expect(seen.thrown.filter((error) => error.name !== "TypeError")).toEqual([]);
  });
});

describe("claims the granted scopes do not release", () => {
  it("never carries the email of a client granted only profile", async () => {
    const limited = await setUpProvider({
      claims: () => ({ email: "secret@example.com", name: "Ada Lovelace" }),
    });
    const issued = await issueCode(limited, { params: { scope: "openid profile" } });
    const exchanged = await redeem(limited, codeForm(issued, PUBLIC_CLIENT));
    const tokens = (await exchanged.clone().json()) as TokenBody;
    const userinfo = await answer(limited.provider, userinfoRequest(tokens.access_token));
    const userinfoText = await userinfo.text();
    const discovery = await (await answer(limited.provider, new Request(DISCOVERY_URL))).text();
    const idPayload = Buffer.from(tokens.id_token.split(".")[1] ?? "", "base64url").toString("utf8");
    const responses = [await exchanged.text(), userinfoText, discovery, idPayload];

    expect(responses.filter((text) => text.includes("secret@example.com"))).toEqual([]);
    expect(JSON.parse(userinfoText)).toEqual({ sub: SUBJECT, name: "Ada Lovelace" });
  });
});
