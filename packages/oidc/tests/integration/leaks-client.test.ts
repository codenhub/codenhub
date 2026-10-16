import { beforeEach, describe, expect, it } from "vitest";

import { type OidcResult, createClient } from "../../src/client";
import {
  appendParam,
  claimsFor,
  clientWith,
  codeOf,
  editJson,
  forgeIdToken,
  type Harness,
  jsonResponse,
  onlyAt,
  readJsonObject,
  REDIRECT_URI,
  setUp,
  startSignIn,
  swapIdToken,
  TOKEN_URL,
  type Tamper,
  USERINFO_URL,
  withParams,
  ISSUER,
  type SignInStart,
} from "./client-support";

/** A value the client must never expose, with a name for the report. */
type Labelled = readonly [label: string, value: string];

/** One failure path: it runs against the harness, records its secrets into the list, and returns its result. */
type Failure = (secrets: Labelled[]) => Promise<OidcResult<unknown>>;

const EMAIL = "leak@example.com";
const PROVIDER_DESCRIPTION = "<script>secret";
const BAD_OPTION_SECRET = "s3cr3t-value-keep-me-out-of-messages";

let harness: Harness;

beforeEach(async () => {
  harness = await setUp({ confidential: true });
});

const identity: Tamper = (_url, response) => response;

/** The secrets a sign-in has before the token request: the code, state, nonce, verifier, and the client secret. */
function signInSecrets(started: SignInStart): Labelled[] {
  return [
    ["authorization code", codeOf(started.location)],
    ["state", started.pending.state],
    ["nonce", started.pending.nonce],
    ["code verifier", started.pending.codeVerifier],
    ["client secret", harness.clientSecret],
  ];
}

/** Records the tokens every token response carries, then passes the response on to `next`. */
function recordTokens(into: Labelled[], next: Tamper): Tamper {
  return async (url, response) => {
    if (url !== TOKEN_URL) {
      return next(url, response);
    }
    const body = await readJsonObject(response);
    for (const name of ["access_token", "refresh_token", "id_token"] as const) {
      const value = body[name];
      if (typeof value === "string") {
        into.push([name, value]);
      }
    }
    return next(url, jsonResponse(body, response.status));
  };
}

/**
 * The text a result exposes. A successful sign-in or refresh returns its tokens by design, and
 * `claims.nonce` is the ID token's own nonce claim, so those two members are set aside. Everything else
 * in a result must hold no secret.
 */
function exposedText(result: OidcResult<unknown>): string {
  if (!result.ok) {
    return JSON.stringify(result);
  }
  const value: Record<string, unknown> = { ...(result.value as Record<string, unknown>) };
  delete value.tokens;
  if (value.claims !== undefined) {
    const claims: Record<string, unknown> = { ...(value.claims as Record<string, unknown>) };
    delete claims.nonce;
    value.claims = claims;
  }
  return JSON.stringify({ ok: true, value });
}

/** The labels of the secrets that appear in `text`. */
function leaksOf(text: string, secrets: readonly Labelled[]): string[] {
  return secrets.filter(([, value]) => value !== "" && text.includes(value)).map(([label]) => label);
}

function okOrThrow<T>(result: OidcResult<T>): T {
  if (!result.ok) {
    throw new Error(`expected success: ${JSON.stringify(result.error.issues)}`);
  }
  return result.value;
}

function requireString(value: string | undefined, what: string): string {
  if (value === undefined) {
    throw new Error(`${what} is missing`);
  }
  return value;
}

/** The error a call throws, or `undefined` when it does not throw. */
async function thrownBy(call: () => unknown): Promise<unknown> {
  try {
    await call();
    return undefined;
  } catch (error) {
    return error;
  }
}

/** Every failure path the hostile suite covers, each run against a fresh sign-in. */
const failures: ReadonlyArray<readonly [string, Failure]> = [
  [
    "the state does not match",
    async (secrets) => {
      const started = await startSignIn();
      secrets.push(...signInSecrets(started));
      return started.client.callback(withParams(started.location, { state: "forged-state" }), started.pending);
    },
  ],
  [
    "the provider returns an error with a description",
    async (secrets) => {
      const started = await startSignIn();
      secrets.push(...signInSecrets(started), ["provider error description", PROVIDER_DESCRIPTION]);
      const url = new URL(REDIRECT_URI);
      url.searchParams.set("state", started.pending.state);
      url.searchParams.set("iss", ISSUER);
      url.searchParams.set("error", "access_denied");
      url.searchParams.set("error_description", PROVIDER_DESCRIPTION);
      return started.client.callback(url.href, started.pending);
    },
  ],
  [
    "the callback carries the code twice",
    async (secrets) => {
      const started = await startSignIn();
      secrets.push(...signInSecrets(started));
      return started.client.callback(appendParam(started.location, "code", codeOf(started.location)), started.pending);
    },
  ],
  [
    "the iss is another issuer",
    async (secrets) => {
      const started = await startSignIn();
      secrets.push(...signInSecrets(started));
      return started.client.callback(withParams(started.location, { iss: "https://evil.example" }), started.pending);
    },
  ],
  [
    "the ID token has a wrong nonce and a claim value",
    async (secrets) => {
      const started = await startSignIn();
      secrets.push(...signInSecrets(started));
      harness.setTamper(
        recordTokens(
          secrets,
          swapIdToken(async () => {
            const token = await forgeIdToken(claimsFor(started.pending, { nonce: "not-the-nonce", email: EMAIL }));
            secrets.push(["forged ID token", token], ["claim value email", EMAIL]);
            return token;
          }),
        ),
      );
      return started.client.callback(started.location, started.pending);
    },
  ],
  [
    "the ID token has a wrong audience and a claim value",
    async (secrets) => {
      const started = await startSignIn();
      secrets.push(...signInSecrets(started));
      harness.setTamper(
        recordTokens(
          secrets,
          swapIdToken(async () => {
            const token = await forgeIdToken(claimsFor(started.pending, { aud: "other", email: EMAIL }));
            secrets.push(["forged ID token", token], ["claim value email", EMAIL]);
            return token;
          }),
        ),
      );
      return started.client.callback(started.location, started.pending);
    },
  ],
  [
    "the token response never arrives in time",
    async (secrets) => {
      const started = await startSignIn();
      secrets.push(...signInSecrets(started));
      harness.setTamper(
        recordTokens(
          secrets,
          onlyAt(TOKEN_URL, () => new Promise<Response>(() => {})),
        ),
      );
      return clientWith(harness, { timeout: 1 }).callback(started.location, started.pending);
    },
  ],
  [
    "the token response is too large",
    async (secrets) => {
      const started = await startSignIn();
      secrets.push(...signInSecrets(started));
      const huge = () => jsonResponse({ access_token: "a", token_type: "Bearer", padding: "y".repeat(70_000) });
      harness.setTamper(recordTokens(secrets, onlyAt(TOKEN_URL, huge)));
      return started.client.callback(started.location, started.pending);
    },
  ],
  [
    "the token response is malformed",
    async (secrets) => {
      const started = await startSignIn();
      secrets.push(...signInSecrets(started));
      const broken = () => new Response("{not json", { status: 200, headers: { "content-type": "application/json" } });
      harness.setTamper(recordTokens(secrets, onlyAt(TOKEN_URL, broken)));
      return started.client.callback(started.location, started.pending);
    },
  ],
  [
    "the token_type is not Bearer",
    async (secrets) => {
      const started = await startSignIn();
      secrets.push(...signInSecrets(started));
      harness.setTamper(
        recordTokens(
          secrets,
          onlyAt(
            TOKEN_URL,
            editJson((body) => ({ ...body, token_type: "mac" })),
          ),
        ),
      );
      return started.client.callback(started.location, started.pending);
    },
  ],
  [
    "the token response has no access_token",
    async (secrets) => {
      const started = await startSignIn();
      secrets.push(...signInSecrets(started));
      harness.setTamper(
        recordTokens(
          secrets,
          onlyAt(
            TOKEN_URL,
            editJson((body) => {
              const copy = { ...body };
              delete copy.access_token;
              return copy;
            }),
          ),
        ),
      );
      return started.client.callback(started.location, started.pending);
    },
  ],
  [
    "a refresh token is reused",
    async (secrets) => {
      const started = await startSignIn();
      secrets.push(...signInSecrets(started));
      harness.setTamper(recordTokens(secrets, identity));
      const signed = okOrThrow(await started.client.callback(started.location, started.pending));
      const refreshToken = requireString(signed.tokens.refreshToken, "refresh token");
      okOrThrow(await started.client.refresh({ refreshToken, subject: "user-1" }));
      return started.client.refresh({ refreshToken, subject: "user-1" });
    },
  ],
  [
    "the userinfo sub belongs to another user",
    async (secrets) => {
      const started = await startSignIn();
      secrets.push(...signInSecrets(started));
      harness.setTamper(recordTokens(secrets, identity));
      const signed = okOrThrow(await started.client.callback(started.location, started.pending));
      harness.setTamper(
        onlyAt(
          USERINFO_URL,
          editJson((body) => ({ ...body, sub: "user-2" })),
        ),
      );
      return started.client.userinfo({ accessToken: signed.tokens.accessToken, subject: "user-1" });
    },
  ],
];

describe("leaks: successful outcomes", () => {
  it("exposes no secret in a sign-in, a refresh, or a userinfo result beyond the tokens it returns", async () => {
    const secrets: Labelled[] = [];
    const started = await startSignIn();
    secrets.push(...signInSecrets(started));
    harness.setTamper(recordTokens(secrets, identity));

    const signed = await started.client.callback(started.location, started.pending);
    const tokens = okOrThrow(signed).tokens;
    const refreshed = await started.client.refresh({
      refreshToken: requireString(tokens.refreshToken, "refresh token"),
      subject: "user-1",
    });
    const claims = await started.client.userinfo({ accessToken: tokens.accessToken, subject: "user-1" });

    // Each outcome must be a success, or the text check below would pass on a failure that holds no secrets.
    expect(signed.ok).toBe(true);
    expect(refreshed.ok).toBe(true);
    expect(claims.ok).toBe(true);
    // The sign-in must have recorded the tokens it returned, or the check below proves nothing.
    expect(secrets.map(([label]) => label)).toEqual(
      expect.arrayContaining([
        "authorization code",
        "state",
        "nonce",
        "code verifier",
        "client secret",
        "access_token",
      ]),
    );
    expect([signed, refreshed, claims].map((result) => leaksOf(exposedText(result), secrets))).toEqual([[], [], []]);
  });
});

describe("leaks: failure outcomes", () => {
  it.each(failures)("exposes no secret when %s", async (_label, run) => {
    const secrets: Labelled[] = [];
    const result = await run(secrets);
    expect(result.ok).toBe(false);
    expect(secrets.length).toBeGreaterThanOrEqual(5);
    expect(leaksOf(JSON.stringify(result), secrets)).toEqual([]);
  });
});

describe("leaks: TypeError messages", () => {
  it("exposes no secret in the TypeError that bad options raise", async () => {
    const metadata = harness.metadata;
    const calls: ReadonlyArray<() => unknown> = [
      () =>
        createClient({
          metadata,
          clientId: "app",
          redirectUri: REDIRECT_URI,
          auth: { method: "client_secret_basic", secret: 42 as unknown as string },
        }),
      () =>
        createClient({
          metadata,
          clientId: "",
          redirectUri: REDIRECT_URI,
          auth: { method: "client_secret_basic", secret: BAD_OPTION_SECRET },
        }),
      () =>
        createClient({
          metadata,
          clientId: 7 as unknown as string,
          redirectUri: REDIRECT_URI,
          auth: { method: "client_secret_basic", secret: BAD_OPTION_SECRET },
        }),
      () =>
        createClient({
          metadata,
          clientId: "app",
          redirectUri: BAD_OPTION_SECRET,
          auth: { method: "none" },
        }),
      () => harness.client.authorize({ maxAge: BAD_OPTION_SECRET as unknown as number }),
      () => harness.client.refresh({ refreshToken: BAD_OPTION_SECRET, subject: 7 as unknown as string }),
      () => harness.client.userinfo({ accessToken: BAD_OPTION_SECRET, subject: 7 as unknown as string }),
    ];
    const errors = await Promise.all(calls.map((call) => thrownBy(call)));
    expect(errors.every((error) => error instanceof TypeError)).toBe(true);
    const text = errors.map((error) => (error instanceof Error ? error.message : "")).join("\n");
    expect(text).not.toBe("");
    expect(
      leaksOf(text, [
        ["bad option secret", BAD_OPTION_SECRET],
        ["client secret", harness.clientSecret],
      ]),
    ).toEqual([]);
  });
});
