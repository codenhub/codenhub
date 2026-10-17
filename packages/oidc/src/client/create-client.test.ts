import {
  type KeyPair,
  type PrivateKey,
  createKeySet,
  exportPublicJwk,
  generateKeyPair,
  generateSecretKey,
  sign,
} from "@codenhub/jwt";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { createProvider, generateClientSecret, hashClientSecret, type ClientAuthentication } from "../provider";
import { computeTokenHash } from "../shared/token-hash";
import type { OidcIssue, OidcResult, ProviderMetadata } from "../shared/types";
import { createMemoryStore } from "../testing";
import { createClient } from "./create-client";
import { discover } from "./discover";
import type { AuthorizeOptions, Client, ClientAuth, ClientOptions, PendingAuthorization } from "./types";

const ISSUER = "https://op.example";
const CLIENT_ID = "app";
const REDIRECT_URI = "https://app.example/callback";
const NOW_S = Math.floor(Date.now() / 1000);

const fakeMetadata: ProviderMetadata = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/authorize`,
  token_endpoint: `${ISSUER}/token`,
  jwks_uri: `${ISSUER}/jwks`,
  userinfo_endpoint: `${ISSUER}/userinfo`,
  response_types_supported: ["code"],
  subject_types_supported: ["public"],
  id_token_signing_alg_values_supported: ["ES256"],
  token_endpoint_auth_methods_supported: [
    "none",
    "client_secret_basic",
    "client_secret_post",
    "client_secret_jwt",
    "private_key_jwt",
  ],
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** What the fake provider does for one authorization code. Every member is optional. */
interface Grant {
  /** Claims for the ID token, merged over the valid defaults. */
  readonly claims?: Readonly<Record<string, unknown>>;
  /** Claims to drop from the ID token after the merge. */
  readonly remove?: readonly string[];
  /** The key that signs the ID token. Defaults to the provider's published key. */
  readonly key?: PrivateKey;
  /** The `typ` header of the ID token. */
  readonly typ?: string;
  /** Replaces the whole token response. */
  readonly reply?: () => Response | Promise<Response>;
}

/** A provider that answers the client's requests with no network, and whose behavior the test sets. */
interface FakeOp {
  readonly keys: KeyPair;
  readonly fetch: typeof fetch;
  /** Registers an authorization code the token endpoint will exchange, and returns it. */
  grant(grant?: Grant): string;
  /** Claims of the ID token a refresh returns. Unset, the refresh returns no ID token. */
  refreshClaims: Readonly<Record<string, unknown>> | undefined;
  /** The userinfo response. It receives the request, so a test can check what the client sent. */
  userinfoReply: (request: Request) => Response;
}

let keys: KeyPair;
let jwks: unknown;

beforeAll(async () => {
  keys = await generateKeyPair({ alg: "ES256", kid: "op-1" });
  jwks = { keys: [await exportPublicJwk(keys.publicKey)] };
});

/**
 * Signs an ID token for an access token. The claims are valid for this client and sign-in unless the grant
 * changes them; a claim set to `undefined` in the grant is left out.
 */
async function signIdToken(accessToken: string, grant: Grant): Promise<string> {
  const atHash = (await computeTokenHash(accessToken, "ES256")) ?? "";
  const payload: Record<string, unknown> = {
    iss: ISSUER,
    sub: "user-1",
    aud: CLIENT_ID,
    exp: NOW_S + 300,
    iat: NOW_S,
    auth_time: NOW_S,
    at_hash: atHash,
    ...grant.claims,
  };
  for (const name of grant.remove ?? []) {
    delete payload[name];
  }
  for (const name of Object.keys(payload)) {
    if (payload[name] === undefined) {
      delete payload[name];
    }
  }
  return sign({
    payload: payload as Parameters<typeof sign>[0]["payload"],
    key: grant.key ?? keys.privateKey,
    header: { typ: grant.typ ?? "JWT" },
  });
}

function createFakeOp(): FakeOp {
  const grants = new Map<string, Grant>();
  let issued = 0;

  const tokenEndpoint = async (request: Request): Promise<Response> => {
    const form = new URLSearchParams(await request.text());
    if (form.get("grant_type") === "refresh_token") {
      return refresh(form.get("refresh_token") ?? "");
    }
    const code = form.get("code") ?? "";
    const grant = grants.get(code);
    if (grant === undefined) {
      return json({ error: "invalid_grant" }, 400);
    }
    if (grant.reply !== undefined) {
      return grant.reply();
    }
    const accessToken = `at-${code}`;
    return json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 300,
      refresh_token: `rt-${code}`,
      id_token: await signIdToken(accessToken, grant),
      scope: "openid profile",
    });
  };

  const refresh = async (refreshToken: string): Promise<Response> => {
    if (!refreshToken.startsWith("rt-")) {
      return json({ error: "invalid_grant" }, 400);
    }
    issued += 1;
    const accessToken = `at-refresh-${issued}`;
    const body: Record<string, unknown> = {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 300,
      refresh_token: `rt-refresh-${issued}`,
    };
    if (op.refreshClaims !== undefined) {
      body.id_token = await signIdToken(accessToken, { claims: op.refreshClaims });
    }
    return json(body);
  };

  const op: FakeOp = {
    keys,
    refreshClaims: undefined,
    userinfoReply: () => json({ sub: "user-1", name: "User user-1" }),
    grant(grant: Grant = {}) {
      issued += 1;
      const code = `code-${issued}`;
      grants.set(code, grant);
      return code;
    },
    fetch: (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const request = new Request(input, init);
      const { pathname } = new URL(request.url);
      if (request.method === "GET" && pathname === "/jwks") {
        return json(jwks);
      }
      if (request.method === "POST" && pathname === "/token") {
        return tokenEndpoint(request);
      }
      if (request.method === "GET" && pathname === "/userinfo") {
        return op.userinfoReply(request);
      }
      return new Response(null, { status: 404 });
    }) as typeof fetch,
  };
  return op;
}

const baseOptions = (fetchFunction: typeof fetch): ClientOptions => ({
  metadata: fakeMetadata,
  clientId: CLIENT_ID,
  redirectUri: REDIRECT_URI,
  auth: { method: "none" },
  fetch: fetchFunction,
});

/** A client for the fake provider. `overrides` replace any member of the base options. */
const clientFor = (op: FakeOp, overrides: Partial<ClientOptions> = {}): Client =>
  createClient({ ...baseOptions(op.fetch), ...overrides });

/** The URL the provider redirects the browser to. A parameter set to `undefined` is left out. */
function redirect(params: Readonly<Record<string, string | undefined>>): string {
  const url = new URL(REDIRECT_URI);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(name, value);
    }
  }
  return url.href;
}

/**
 * Starts a sign-in, then registers a grant for the nonce it produced. Returns the pending state and the
 * callback URL a successful provider redirect would carry.
 */
async function begin(op: FakeOp, rp: Client, grant: Grant = {}, authorize?: AuthorizeOptions) {
  const started = await rp.authorize(authorize);
  const code = op.grant({ ...grant, claims: { nonce: started.pending.nonce, ...grant.claims } });
  const url = redirect({ code, state: started.pending.state });
  return { pending: started.pending, code, url };
}

const issuesOf = (result: OidcResult<unknown>): readonly OidcIssue[] => {
  if (result.ok) {
    throw new Error("expected a failed result");
  }
  return result.error.issues;
};

describe("createClient", () => {
  it("returns a frozen client, and makes no request while it is created", () => {
    const op = createFakeOp();
    const fetchSpy = vi.fn(op.fetch);
    const rp = createClient(baseOptions(fetchSpy));

    expect(Object.isFrozen(rp)).toBe(true);
    expect(rp.metadata.issuer).toBe(ISSUER);
    expect(fetchSpy).toHaveBeenCalledTimes(0);
  });

  it("refuses a missing or invalid option at creation, naming it", () => {
    expect(() => createClient({ ...baseOptions(createFakeOp().fetch), clientId: "" })).toThrow(TypeError);
  });
});

describe("authorize", () => {
  it("returns an authorization URL for this client with PKCE S256", async () => {
    const rp = clientFor(createFakeOp());

    const started = await rp.authorize();
    const url = new URL(started.url);

    expect(url.origin + url.pathname).toBe(`${ISSUER}/authorize`);
    expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe(started.pending.state);
    expect(url.searchParams.get("nonce")).toBe(started.pending.nonce);
  });

  it("keeps a fresh state, nonce, and verifier for each request", async () => {
    const rp = clientFor(createFakeOp());

    const first = await rp.authorize();
    const second = await rp.authorize();

    expect(first.pending.state).not.toBe(second.pending.state);
    expect(first.pending.nonce).not.toBe(second.pending.nonce);
    expect(first.pending.codeVerifier).not.toBe(second.pending.codeVerifier);
  });

  it("records the max_age it asked for in the pending state", async () => {
    const rp = clientFor(createFakeOp());

    const started = await rp.authorize({ maxAge: 300 });

    expect(started.pending.maxAge).toBe(300);
  });

  it("rejects a scope list without openid", async () => {
    const rp = clientFor(createFakeOp());

    await expect(rp.authorize({ scope: ["profile"] })).rejects.toThrow(TypeError);
  });
});

describe("callback", () => {
  it("returns the claims and tokens for a valid response", async () => {
    const op = createFakeOp();
    const rp = clientFor(op);
    const { pending, url } = await begin(op, rp);

    const result = await rp.callback(url, pending);

    expect(result).toMatchObject({
      ok: true,
      value: {
        claims: { sub: "user-1", iss: ISSUER, aud: CLIENT_ID },
        tokens: { accessToken: expect.any(String), tokenType: "Bearer", refreshToken: expect.any(String) },
      },
    });
    expect(result.ok && typeof result.value.tokens.idToken).toBe("string");
  });

  it("accepts the callback as a URL object", async () => {
    const op = createFakeOp();
    const rp = clientFor(op);
    const { pending, url } = await begin(op, rp);

    const result = await rp.callback(new URL(url), pending);

    expect(result.ok).toBe(true);
  });

  it("refuses a callback whose state is not the pending one", async () => {
    const op = createFakeOp();
    const rp = clientFor(op);
    const { pending, code } = await begin(op, rp);

    const result = await rp.callback(redirect({ code, state: "other-state" }), pending);

    expect(issuesOf(result)).toEqual([{ code: "state_mismatch", path: ["callback", "state"] }]);
  });

  it("refuses a callback with no state", async () => {
    const op = createFakeOp();
    const rp = clientFor(op);
    const { pending, code } = await begin(op, rp);

    const result = await rp.callback(redirect({ code, state: undefined }), pending);

    expect(issuesOf(result)).toEqual([{ code: "invalid_callback", path: ["callback", "state"] }]);
  });

  it("refuses an iss from another issuer, as a mix-up attack would send", async () => {
    const op = createFakeOp();
    const rp = clientFor(op);
    const { pending, url } = await begin(op, rp);

    const result = await rp.callback(`${url}&iss=${encodeURIComponent("https://evil.example")}`, pending);

    expect(issuesOf(result)).toEqual([{ code: "iss_mismatch", path: ["callback", "iss"] }]);
  });

  it("accepts a matching iss", async () => {
    const op = createFakeOp();
    const rp = clientFor(op);
    const { pending, code } = await begin(op, rp);

    const result = await rp.callback(redirect({ code, state: pending.state, iss: ISSUER }), pending);

    expect(result.ok).toBe(true);
  });

  it("refuses a callback without iss when the provider advertises it", async () => {
    const op = createFakeOp();
    const rp = clientFor(op, {
      metadata: { ...fakeMetadata, authorization_response_iss_parameter_supported: true },
    });
    const { pending, url } = await begin(op, rp);

    const result = await rp.callback(url, pending);

    expect(issuesOf(result)).toEqual([{ code: "iss_mismatch", path: ["callback", "iss"] }]);
  });

  it("accepts a callback without iss when the provider does not advertise it", async () => {
    const op = createFakeOp();
    const rp = clientFor(op);
    const { pending, url } = await begin(op, rp);

    const result = await rp.callback(url, pending);

    expect(result.ok).toBe(true);
  });

  it("reports an access_denied from the provider as provider_error with its code", async () => {
    const op = createFakeOp();
    const rp = clientFor(op);
    const { pending, code } = await begin(op, rp);

    const result = await rp.callback(redirect({ code, state: pending.state, error: "access_denied" }), pending);

    expect(issuesOf(result)).toEqual([
      { code: "provider_error", params: { endpoint: "authorization", error: "access_denied" } },
    ]);
  });

  it("narrows an unknown provider error to unknown, and keeps its text out of the result", async () => {
    const op = createFakeOp();
    const rp = clientFor(op);
    const { pending, code } = await begin(op, rp);
    const text = "provider-said-something-private";

    const result = await rp.callback(redirect({ code, state: pending.state, error: text }), pending);

    expect(issuesOf(result)).toEqual([
      { code: "provider_error", params: { endpoint: "authorization", error: "unknown" } },
    ]);
    expect(JSON.stringify(result)).not.toContain(text);
  });

  it("refuses a parameter repeated in the callback", async () => {
    const op = createFakeOp();
    const rp = clientFor(op);
    const { pending, url } = await begin(op, rp);

    const result = await rp.callback(`${url}&code=another`, pending);

    expect(issuesOf(result)).toEqual([
      { code: "invalid_callback", path: ["callback"], params: { reason: "duplicate" } },
    ]);
  });

  it("refuses a callback with no code", async () => {
    const op = createFakeOp();
    const rp = clientFor(op);
    const { pending, url } = await begin(op, rp);

    const result = await rp.callback(url.replace(/code=[^&]*&?/, ""), pending);

    expect(issuesOf(result)).toEqual([{ code: "invalid_callback", path: ["callback", "code"] }]);
  });

  it("refuses a callback URL that is too long, before parsing it", async () => {
    const op = createFakeOp();
    const rp = clientFor(op);
    const { pending, url } = await begin(op, rp);

    const result = await rp.callback(`${url}&pad=${"x".repeat(9000)}`, pending);

    expect(issuesOf(result)).toEqual([{ code: "invalid_callback", path: ["callback"] }]);
  });

  it("refuses a string that is not a URL", async () => {
    const op = createFakeOp();
    const rp = clientFor(op);
    const { pending } = await begin(op, rp);

    const result = await rp.callback("not a url", pending);

    expect(issuesOf(result)).toEqual([{ code: "invalid_callback", path: ["callback"] }]);
  });

  it("reports a token endpoint that rejects the code as provider_error", async () => {
    const op = createFakeOp();
    const rp = clientFor(op);
    const { pending, url } = await begin(op, rp, {
      reply: () => json({ error: "invalid_grant", error_description: "code-was-used" }, 400),
    });

    const result = await rp.callback(url, pending);

    expect(issuesOf(result)).toEqual([
      { code: "provider_error", params: { endpoint: "token", error: "invalid_grant" } },
    ]);
  });

  it("reports a token response without an ID token as invalid", async () => {
    const op = createFakeOp();
    const rp = clientFor(op);
    const { pending, url } = await begin(op, rp, {
      reply: () => json({ access_token: "at-x", token_type: "Bearer" }),
    });

    const result = await rp.callback(url, pending);

    expect(issuesOf(result)).toEqual([{ code: "invalid_token_response", path: ["response", "id_token"] }]);
  });

  it("throws a TypeError when the pending state is missing its state", async () => {
    const op = createFakeOp();
    const rp = clientFor(op);
    const { pending, url } = await begin(op, rp);
    const malformed = { ...pending, state: "" } as PendingAuthorization;

    await expect(rp.callback(url, malformed)).rejects.toThrow(TypeError);
  });

  it("throws a TypeError when pending.maxAge is negative", async () => {
    const op = createFakeOp();
    const rp = clientFor(op);
    const { pending, url } = await begin(op, rp);
    const malformed = { ...pending, maxAge: -1 } as PendingAuthorization;

    await expect(rp.callback(url, malformed)).rejects.toThrow(TypeError);
  });

  it("throws a TypeError when the url is neither a string nor a URL", async () => {
    const op = createFakeOp();
    const rp = clientFor(op);
    const { pending } = await begin(op, rp);

    await expect(rp.callback(42 as unknown as string, pending)).rejects.toThrow(TypeError);
  });
});

describe("ID token checks through the callback", () => {
  it("refuses a nonce that is not the one sent", async () => {
    const op = createFakeOp();
    const rp = clientFor(op);
    const { pending, url } = await begin(op, rp, { claims: { nonce: "nonce-from-elsewhere" } });

    const result = await rp.callback(url, pending);

    expect(issuesOf(result)).toEqual([{ code: "nonce_mismatch", path: ["id_token", "payload", "nonce"] }]);
  });

  it("refuses an ID token issued for another client", async () => {
    const op = createFakeOp();
    const rp = clientFor(op);
    const { pending, url } = await begin(op, rp, { claims: { aud: "other-app" } });

    const result = await rp.callback(url, pending);

    expect(issuesOf(result)).toEqual([
      { code: "invalid_id_token", path: ["id_token", "payload", "aud"], params: { jwtCode: "wrong_audience" } },
    ]);
  });

  it("refuses an ID token from another issuer", async () => {
    const op = createFakeOp();
    const rp = clientFor(op);
    const { pending, url } = await begin(op, rp, { claims: { iss: "https://evil.example" } });

    const result = await rp.callback(url, pending);

    expect(issuesOf(result)).toEqual([
      { code: "invalid_id_token", path: ["id_token", "payload", "iss"], params: { jwtCode: "wrong_issuer" } },
    ]);
  });

  it("refuses several audiences with no azp", async () => {
    const op = createFakeOp();
    const rp = clientFor(op);
    const { pending, url } = await begin(op, rp, { claims: { aud: [CLIENT_ID, "other-app"] } });

    const result = await rp.callback(url, pending);

    expect(issuesOf(result)).toEqual([{ code: "azp_mismatch", path: ["id_token", "payload", "azp"] }]);
  });

  it("refuses an azp that names another client", async () => {
    const op = createFakeOp();
    const rp = clientFor(op);
    const { pending, url } = await begin(op, rp, { claims: { aud: [CLIENT_ID, "other-app"], azp: "other-app" } });

    const result = await rp.callback(url, pending);

    expect(issuesOf(result)).toEqual([{ code: "azp_mismatch", path: ["id_token", "payload", "azp"] }]);
  });

  it("refuses an expired ID token", async () => {
    const op = createFakeOp();
    const rp = clientFor(op);
    const { pending, url } = await begin(op, rp, { claims: { exp: NOW_S - 60 } });

    const result = await rp.callback(url, pending);

    expect(issuesOf(result)).toEqual([
      { code: "invalid_id_token", path: ["id_token", "payload", "exp"], params: { jwtCode: "expired" } },
    ]);
  });

  it("refuses an ID token signed by a key the provider did not publish", async () => {
    const op = createFakeOp();
    const rp = clientFor(op);
    const stranger = await generateKeyPair({ alg: "ES256", kid: "op-1" });
    const { pending, url } = await begin(op, rp, { key: stranger.privateKey });

    const result = await rp.callback(url, pending);

    expect(issuesOf(result)).toEqual([
      { code: "invalid_id_token", path: ["id_token"], params: { jwtCode: "bad_signature" } },
    ]);
  });

  it("refuses an access token presented as the ID token", async () => {
    const op = createFakeOp();
    const rp = clientFor(op);
    const { pending, url } = await begin(op, rp, { typ: "at+jwt" });

    const result = await rp.callback(url, pending);

    expect(issuesOf(result)).toEqual([
      { code: "invalid_id_token", path: ["id_token", "header", "typ"], params: { jwtCode: "wrong_type" } },
    ]);
  });

  it("refuses an at_hash that does not match the access token", async () => {
    const op = createFakeOp();
    const rp = clientFor(op);
    const wrongHash = (await computeTokenHash("some-other-token", "ES256")) ?? "";
    const { pending, url } = await begin(op, rp, { claims: { at_hash: wrongHash } });

    const result = await rp.callback(url, pending);

    expect(issuesOf(result)).toEqual([{ code: "at_hash_mismatch", path: ["id_token", "payload", "at_hash"] }]);
  });

  it("refuses max_age when the ID token has no auth_time", async () => {
    const op = createFakeOp();
    const rp = clientFor(op);
    const { pending, url } = await begin(op, rp, { remove: ["auth_time"] }, { maxAge: 300 });

    const result = await rp.callback(url, pending);

    expect(issuesOf(result)).toEqual([{ code: "auth_time_missing", path: ["id_token", "payload", "auth_time"] }]);
  });

  it("refuses an authentication older than max_age", async () => {
    const op = createFakeOp();
    const rp = clientFor(op);
    const { pending, url } = await begin(op, rp, { claims: { auth_time: NOW_S - 3600 } }, { maxAge: 300 });

    const result = await rp.callback(url, pending);

    expect(issuesOf(result)).toEqual([{ code: "auth_too_old", path: ["id_token", "payload", "auth_time"] }]);
  });
});

describe("refresh", () => {
  it("exchanges the refresh token for new tokens and rotates it", async () => {
    const op = createFakeOp();
    const rp = clientFor(op);
    const { pending, url } = await begin(op, rp);
    const first = await rp.callback(url, pending);
    if (!first.ok) {
      throw new Error("sign-in failed");
    }
    const oldRefresh = first.value.tokens.refreshToken ?? "";

    const result = await rp.refresh({ refreshToken: oldRefresh, subject: "user-1" });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.tokens.refreshToken).not.toBe(oldRefresh);
    expect(result.ok && result.value.tokens.accessToken).not.toBe(first.value.tokens.accessToken);
  });

  it("returns the claims of a new ID token the provider sends", async () => {
    const op = createFakeOp();
    op.refreshClaims = {};
    const rp = clientFor(op);

    const result = await rp.refresh({ refreshToken: "rt-seed", subject: "user-1" });

    expect(result).toMatchObject({ ok: true, value: { claims: { sub: "user-1" } } });
  });

  it("refuses a new ID token whose subject is not the one refreshed", async () => {
    const op = createFakeOp();
    op.refreshClaims = { sub: "user-2" };
    const rp = clientFor(op);

    const result = await rp.refresh({ refreshToken: "rt-seed", subject: "user-1" });

    expect(issuesOf(result)).toEqual([{ code: "subject_mismatch", path: ["id_token", "payload", "sub"] }]);
  });

  it("reports a refresh token the provider refuses as provider_error", async () => {
    const rp = clientFor(createFakeOp());

    const result = await rp.refresh({ refreshToken: "revoked", subject: "user-1" });

    expect(issuesOf(result)).toEqual([
      { code: "provider_error", params: { endpoint: "token", error: "invalid_grant" } },
    ]);
  });

  it("throws a TypeError for an empty refresh token", async () => {
    const rp = clientFor(createFakeOp());

    await expect(rp.refresh({ refreshToken: "", subject: "user-1" })).rejects.toThrow(TypeError);
  });

  it("throws a TypeError for a scope list that is empty", async () => {
    const rp = clientFor(createFakeOp());

    await expect(rp.refresh({ refreshToken: "rt-seed", subject: "user-1", scope: [] })).rejects.toThrow(TypeError);
  });

  it("throws a TypeError for a null scope", async () => {
    const rp = clientFor(createFakeOp());

    await expect(
      rp.refresh({ refreshToken: "rt-seed", subject: "user-1", scope: null as unknown as readonly string[] }),
    ).rejects.toThrow(
      expect.objectContaining({ name: "TypeError", message: expect.stringContaining("refresh: scope") }),
    );
  });

  it("throws a TypeError for a scope list of more than 100 entries", async () => {
    const rp = clientFor(createFakeOp());
    const scope = Array.from({ length: 101 }, (_, index) => `s${index}`);

    await expect(rp.refresh({ refreshToken: "rt-seed", subject: "user-1", scope })).rejects.toThrow(
      expect.objectContaining({ name: "TypeError", message: expect.stringContaining("at most 100") }),
    );
  });

  it("throws a TypeError for a joined scope longer than the provider accepts", async () => {
    const rp = clientFor(createFakeOp());

    await expect(
      rp.refresh({ refreshToken: "rt-seed", subject: "user-1", scope: ["openid", "s".repeat(4096)] }),
    ).rejects.toThrow(
      expect.objectContaining({ name: "TypeError", message: expect.stringContaining("refresh: scope") }),
    );
  });

  it("throws a TypeError for a sparse scope list", async () => {
    const rp = clientFor(createFakeOp());
    // oxlint-disable-next-line no-sparse-arrays -- the hole is what this test is about
    const scope = ["openid", , "profile"] as unknown as readonly string[];

    await expect(rp.refresh({ refreshToken: "rt-seed", subject: "user-1", scope })).rejects.toThrow(TypeError);
  });

  it("sends each requested scope once, in first-seen order", async () => {
    const op = createFakeOp();
    const sent: URLSearchParams[] = [];
    const fetchSpy = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") {
        sent.push(new URLSearchParams(String(init.body)));
      }
      return op.fetch(input, init);
    });
    const rp = createClient(baseOptions(fetchSpy));

    await rp.refresh({ refreshToken: "rt-seed", subject: "user-1", scope: ["openid", "profile", "openid", "email"] });

    expect(sent[0]?.get("scope")).toBe("openid profile email");
  });
});

describe("userinfo", () => {
  it("returns the claims when the subject matches", async () => {
    const op = createFakeOp();
    let authorization: string | null = null;
    op.userinfoReply = (request) => {
      authorization = request.headers.get("authorization");
      return json({ sub: "user-1", name: "User user-1" });
    };
    const rp = clientFor(op);

    const result = await rp.userinfo({ accessToken: "at-1", subject: "user-1" });

    expect(result).toEqual({ ok: true, value: { sub: "user-1", name: "User user-1" } });
    expect(authorization).toBe("Bearer at-1");
  });

  it("refuses claims about another subject", async () => {
    const op = createFakeOp();
    op.userinfoReply = () => json({ sub: "user-2" });
    const rp = clientFor(op);

    const result = await rp.userinfo({ accessToken: "at-1", subject: "user-1" });

    expect(issuesOf(result)).toEqual([{ code: "subject_mismatch", path: ["userinfo", "sub"] }]);
  });

  it("refuses a response with no sub as invalid", async () => {
    const op = createFakeOp();
    op.userinfoReply = () => json({ name: "No subject" });
    const rp = clientFor(op);

    const result = await rp.userinfo({ accessToken: "at-1", subject: "user-1" });

    expect(issuesOf(result)).toEqual([{ code: "invalid_userinfo", path: ["userinfo", "sub"] }]);
  });

  it("reports a 401 as request_failed with its status", async () => {
    const op = createFakeOp();
    op.userinfoReply = () => json({ error: "invalid_token" }, 401);
    const rp = clientFor(op);

    const result = await rp.userinfo({ accessToken: "revoked", subject: "user-1" });

    expect(issuesOf(result)).toEqual([
      { code: "request_failed", params: { endpoint: "userinfo", reason: "status", status: 401 } },
    ]);
  });

  it("throws a TypeError when the provider has no userinfo endpoint", async () => {
    const rp = clientFor(createFakeOp(), { metadata: { ...fakeMetadata, userinfo_endpoint: undefined } });

    await expect(rp.userinfo({ accessToken: "at-1", subject: "user-1" })).rejects.toThrow(TypeError);
  });

  it("throws a TypeError for an empty access token", async () => {
    const rp = clientFor(createFakeOp());

    await expect(rp.userinfo({ accessToken: "", subject: "user-1" })).rejects.toThrow(TypeError);
  });
});

describe("revoke", () => {
  const REVOCATION_ENDPOINT = `${ISSUER}/revoke`;
  const revoker = (reply: (request: Request) => Response, sent: Request[] = []): Client =>
    createClient({
      ...baseOptions(async (input, init) => {
        const request = new Request(input, init);
        sent.push(request);
        return reply(request);
      }),
      metadata: { ...fakeMetadata, revocation_endpoint: REVOCATION_ENDPOINT },
    });

  it("posts the token and hint with the client's credentials, and accepts a 200 with any body", async () => {
    const sent: Request[] = [];
    const rp = revoker(() => new Response("ignored", { status: 200, headers: { "content-type": "text/plain" } }), sent);

    const result = await rp.revoke({ token: "rt-1", tokenTypeHint: "refresh_token" });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(sent[0]?.url).toBe(REVOCATION_ENDPOINT);
    expect(sent[0]?.method).toBe("POST");
    expect(Object.fromEntries(new URLSearchParams(await sent[0]?.text()))).toEqual({
      token: "rt-1",
      token_type_hint: "refresh_token",
      client_id: CLIENT_ID,
    });
  });

  it("reports an OAuth error as provider_error, and any other failure as request_failed", async () => {
    const refused = await revoker(() => json({ error: "unsupported_token_type", error_description: "x" }, 400)).revoke({
      token: "at-1",
    });
    const broken = await revoker(() => new Response(null, { status: 503 })).revoke({ token: "at-1" });

    expect(issuesOf(refused)).toEqual([
      { code: "provider_error", params: { endpoint: "revocation", error: "unknown" } },
    ]);
    expect(issuesOf(broken)).toEqual([
      { code: "request_failed", params: { endpoint: "revocation", reason: "status", status: 503 } },
    ]);
  });

  it("throws a TypeError for a provider without the endpoint, an empty token, or an unknown hint", async () => {
    const withoutEndpoint = clientFor(createFakeOp());
    const rp = revoker(() => new Response(null));

    await expect(withoutEndpoint.revoke({ token: "at-1" })).rejects.toThrow(TypeError);
    await expect(rp.revoke({ token: "" })).rejects.toThrow(TypeError);
    await expect(rp.revoke({ token: "at-1", tokenTypeHint: "id_token" as unknown as "access_token" })).rejects.toThrow(
      TypeError,
    );
  });
});

describe("leaks", () => {
  it("keeps the code, tokens, state, nonce, and verifier out of every failure", async () => {
    const op = createFakeOp();
    const rp = clientFor(op);
    const secrets: string[] = [];
    const record = (value: string) => secrets.push(value);

    // A token the provider sends that this client refuses. Its raw form must not come back.
    const rawIdToken = await signIdToken("at-leak", { claims: { aud: "other-app" } });
    record(rawIdToken);
    record("at-leaked-value");
    record("raw-description");
    const cases = [
      await begin(op, rp, { claims: { aud: "other-app" } }),
      await begin(op, rp, {
        reply: () => json({ access_token: "at-leaked-value", token_type: "mac", id_token: rawIdToken }),
      }),
      await begin(op, rp, { reply: () => json({ error: "invalid_grant", error_description: "raw-description" }, 400) }),
    ];
    for (const attempt of cases) {
      record(attempt.code);
      record(attempt.pending.state);
      record(attempt.pending.nonce);
      record(attempt.pending.codeVerifier);
    }

    const results = await Promise.all(cases.map((attempt) => rp.callback(attempt.url, attempt.pending)));
    for (const result of results) {
      expect(result.ok).toBe(false);
      for (const secret of secrets) {
        expect(JSON.stringify(result)).not.toContain(secret);
      }
    }
  });
});

describe("sign-in through the provider", () => {
  type ProviderAuth = "none" | "client_secret_basic" | "client_secret_post" | "client_secret_jwt" | "private_key_jwt";

  /** A provider with one registered client, using the given authentication method. */
  async function providerFor(method: ProviderAuth) {
    const signingKey = await generateKeyPair({ alg: "ES256", kid: "op-1" });
    const secret = generateClientSecret();
    const clientKey = await generateKeyPair({ alg: "ES256", kid: "rp-1" });
    const hmacKey = await generateSecretKey({ alg: "HS256" });
    const registered: ClientAuthentication =
      method === "none"
        ? { method: "none" }
        : method === "client_secret_basic" || method === "client_secret_post"
          ? { method, secretHash: await hashClientSecret(secret) }
          : method === "client_secret_jwt"
            ? { method, key: hmacKey }
            : { method, keys: createKeySet([clientKey.publicKey]) };
    const store = createMemoryStore({
      clients: [
        {
          clientId: CLIENT_ID,
          redirectUris: [REDIRECT_URI],
          scopes: ["openid", "profile", "offline_access"],
          auth: registered,
        },
      ],
    });
    const provider = createProvider({
      issuer: ISSUER,
      signingKeys: [signingKey],
      store,
      claims: ({ subject }) => ({ name: `User ${subject}` }),
    });
    const fetch = (async (input: string | URL | Request, init?: RequestInit) =>
      (await provider.handle(new Request(input, init))) ??
      new Response(null, { status: 404 })) as typeof globalThis.fetch;
    const clientAuth: ClientAuth =
      method === "none"
        ? { method: "none" }
        : method === "client_secret_basic" || method === "client_secret_post"
          ? { method, secret }
          : method === "client_secret_jwt"
            ? { method, key: hmacKey }
            : { method, key: clientKey.privateKey };
    return { provider, fetch, clientAuth };
  }

  it.each<ProviderAuth>(["none", "client_secret_basic", "client_secret_post", "client_secret_jwt", "private_key_jwt"])(
    "signs in with %s",
    async (method) => {
      const { provider, fetch, clientAuth } = await providerFor(method);
      const discovered = await discover(ISSUER, { fetch });
      if (!discovered.ok) {
        throw new Error("discovery failed");
      }
      const rp = createClient({
        metadata: discovered.value,
        clientId: CLIENT_ID,
        redirectUri: REDIRECT_URI,
        auth: clientAuth,
        fetch,
      });
      const started = await rp.authorize({ scope: ["openid", "profile", "offline_access"] });
      const begun = await provider.beginAuthorization(new Request(started.url));
      if (!begun.ok) {
        throw new Error("beginAuthorization failed");
      }
      const completed = await provider.completeAuthorization(begun.value.id, {
        subject: "user-1",
        authTime: NOW_S,
        scopes: begun.value.scopes,
        amr: ["pwd"],
      });
      if (!completed.ok) {
        throw new Error("completeAuthorization failed");
      }
      const location = completed.value.headers.get("location") ?? "";

      const signedIn = await rp.callback(location, started.pending);

      expect(signedIn).toMatchObject({ ok: true, value: { claims: { sub: "user-1", aud: CLIENT_ID } } });
    },
  );
});
