import { generateKeyPair } from "@codenhub/jwt";
import { describe, expect, it, vi } from "vitest";

import { digestKey } from "../shared/encoding";
import { computeCodeChallenge } from "../shared/pkce";
import type { OidcResult } from "../shared/types";
import { type MemoryStore, createMemoryStore } from "../testing/memory-store";
import { createProvider } from "./create-provider";
import type {
  AccessTokenFormat,
  AccessTokenRecord,
  AuthenticationFailure,
  Provider,
  ProviderDiagnostic,
} from "./types";

const ISSUER = "https://op.example";
const REDIRECT_URI = "https://app.example/cb";
const VERIFIER = "v".repeat(43);
const NOW_MS = 1_800_000_000_000;
const NOW_SECONDS = NOW_MS / 1000;
const API = "https://api.example";
const DATA = "urn:example:data";
const TOKEN = "seeded-token";

interface Setup {
  readonly op: Provider;
  readonly store: MemoryStore;
  readonly diagnostics: ProviderDiagnostic[];
}

async function setup(accessToken: AccessTokenFormat = { format: "opaque" }): Promise<Setup> {
  const store = createMemoryStore({
    clients: [
      {
        clientId: "web",
        redirectUris: [REDIRECT_URI],
        scopes: ["openid", "offline_access", "data:read", "data:write"],
        auth: { method: "none" },
        resources: [API, DATA],
      },
    ],
  });
  const diagnostics: ProviderDiagnostic[] = [];
  const op = createProvider({
    issuer: ISSUER,
    signingKeys: [await generateKeyPair({ alg: "ES256", kid: "k1" })],
    store,
    claims: () => ({}),
    accessToken,
    now: () => NOW_MS,
    onDiagnostic: (diagnostic) => {
      diagnostics.push(diagnostic);
    },
  });
  return { op, store, diagnostics };
}

const record = (overrides: Partial<AccessTokenRecord> = {}): AccessTokenRecord => ({
  grantId: "grant-1",
  clientId: "web",
  subject: "user-1",
  scopes: ["openid", "data:read"],
  audience: [API],
  expiresAt: NOW_SECONDS + 60,
  ...overrides,
});

async function seed(store: MemoryStore, value: AccessTokenRecord = record(), token = TOKEN): Promise<void> {
  await store.saveAccessToken(await digestKey(token), value);
}

const apiRequest = (authorization?: string): Request =>
  new Request(`${API}/items`, authorization === undefined ? {} : { headers: { authorization } });

function failureOf(result: OidcResult<AccessTokenRecord, AuthenticationFailure>): AuthenticationFailure {
  if (result.ok) {
    throw new Error("expected the request to fail");
  }
  return result.error;
}

function valueOf(result: OidcResult<AccessTokenRecord, AuthenticationFailure>): AccessTokenRecord {
  if (!result.ok) {
    throw new Error(`expected the request to pass: ${result.error.reason}`);
  }
  return result.value;
}

/** Signs the user in with `resources` and redeems the code, returning the token response. */
async function signIn(op: Provider, resources: readonly string[]): Promise<Record<string, string>> {
  const parameters = new URLSearchParams({
    response_type: "code",
    client_id: "web",
    redirect_uri: REDIRECT_URI,
    scope: "openid offline_access data:read",
    state: "state-1",
    nonce: "nonce-1",
    code_challenge: await computeCodeChallenge(VERIFIER),
    code_challenge_method: "S256",
  });
  for (const resource of resources) {
    parameters.append("resource", resource);
  }
  const begun = await op.beginAuthorization(new Request(`${ISSUER}/authorize?${parameters.toString()}`));
  if (!begun.ok) {
    throw new Error("expected the request to pass");
  }
  const completed = await op.completeAuthorization(begun.value.id, {
    subject: "user-1",
    authTime: NOW_SECONDS - 10,
    scopes: ["openid", "offline_access", "data:read"],
  });
  if (!completed.ok) {
    throw new Error("expected the grant to complete");
  }
  const code = new URL(completed.value.headers.get("location") ?? "").searchParams.get("code") ?? "";
  const response = await op.handle(
    new Request(`${ISSUER}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: "web",
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: VERIFIER,
      }).toString(),
    }),
  );
  expect(response?.status).toBe(200);
  return (await response?.json()) as Record<string, string>;
}

describe("authenticate", () => {
  it("returns a frozen copy of the record of a live access token", async () => {
    const { op, store } = await setup();
    await seed(store, { ...record(), sessionId: "session-1" });

    const value = valueOf(
      await op.authenticate(apiRequest(`Bearer ${TOKEN}`), { audience: API, scopes: ["data:read"] }),
    );

    expect(value).toEqual({ ...record(), sessionId: "session-1" });
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.scopes)).toBe(true);
    expect(Object.isFrozen(value.audience)).toBe(true);
    // The store's own record is not the one frozen and handed out.
    const stored = await store.findAccessToken(await digestKey(TOKEN));
    expect(stored?.scopes).not.toBe(value.scopes);
  });

  it("keeps only the record's contract fields", async () => {
    const { op, store } = await setup();
    await seed(store, { ...record(), extra: "from-the-store" } as AccessTokenRecord);

    const value = valueOf(await op.authenticate(apiRequest(`Bearer ${TOKEN}`)));

    expect(value).not.toHaveProperty("extra");
  });

  it("accepts the scheme in any case and with several spaces, as userinfo does", async () => {
    const { op, store } = await setup();
    await seed(store);

    const result = await op.authenticate(apiRequest(`bEaReR   ${TOKEN}`));

    expect(result.ok).toBe(true);
  });

  it("answers a request without a token with a bare Bearer challenge", async () => {
    const { op, store } = await setup();
    await seed(store);

    const failure = failureOf(await op.authenticate(new Request(`${API}/items?access_token=${TOKEN}`)));

    expect(failure.reason).toBe("access_token_missing");
    expect(failure.issues).toEqual([{ code: "invalid_token" }]);
    expect(failure.response.status).toBe(401);
    expect(failure.response.headers.get("www-authenticate")).toBe("Bearer");
    expect(failure).not.toHaveProperty("clientId");
  });

  it.each([
    ["Basic", `Basic ${TOKEN}`],
    ["a scheme alone", "Digest"],
    ["an empty header", ""],
  ])("answers another authentication scheme, %s, as a request without a token", async (_, authorization) => {
    const { op, store } = await setup();
    await seed(store);

    const failure = failureOf(await op.authenticate(apiRequest(authorization)));

    expect(failure.reason).toBe("access_token_missing");
    expect(failure.issues).toEqual([{ code: "invalid_token" }]);
    expect(failure.response.status).toBe(401);
    expect(failure.response.headers.get("www-authenticate")).toBe("Bearer");
  });

  it.each([
    ["the scheme alone", "Bearer"],
    ["the scheme in another case with no token", "bEaReR "],
    ["two tokens", `Bearer ${TOKEN} ${TOKEN}`],
    ["a character outside b64token", `Bearer ${TOKEN}"`],
    ["padding before the end", "Bearer ab=c"],
  ])("answers a malformed header, %s, with 400 invalid_request", async (_, authorization) => {
    const { op, store } = await setup();
    await seed(store);

    const failure = failureOf(await op.authenticate(apiRequest(authorization)));

    expect(failure.reason).toBe("access_token_malformed");
    expect(failure.issues).toEqual([{ code: "invalid_request" }]);
    expect(failure.response.status).toBe(400);
    expect(failure.response.headers.get("www-authenticate")).toBe('Bearer error="invalid_request"');
  });

  it("refuses an oversized token as unknown, without throwing", async () => {
    const { op } = await setup();

    const failure = failureOf(await op.authenticate(apiRequest(`Bearer ${"a".repeat(100_000)}`)));

    expect(failure.reason).toBe("access_token_unknown");
    expect(failure.response.status).toBe(401);
    expect(failure.response.headers.get("www-authenticate")).toBe('Bearer error="invalid_token"');
  });

  it("refuses an expired token, naming its client", async () => {
    const { op, store } = await setup();
    await seed(store, record({ expiresAt: NOW_SECONDS }));

    const failure = failureOf(await op.authenticate(apiRequest(`Bearer ${TOKEN}`)));

    expect(failure.reason).toBe("access_token_expired");
    expect(failure.issues).toEqual([{ code: "invalid_token" }]);
    expect(failure.clientId).toBe("web");
    expect(failure.response.status).toBe(401);
  });

  it("refuses a token whose audience is another resource", async () => {
    const { op, store } = await setup();
    await seed(store, record({ audience: [DATA] }));

    const failure = failureOf(
      await op.authenticate(apiRequest(`Bearer ${TOKEN}`), { audience: API, scopes: ["admin"] }),
    );

    // The audience is checked first, so the challenge does not tell another API's token which scopes it lacks.
    expect(failure.reason).toBe("access_token_audience_mismatch");
    expect(failure.issues).toEqual([{ code: "invalid_token" }]);
    expect(failure.clientId).toBe("web");
    expect(failure.response.status).toBe(401);
    expect(failure.response.headers.get("www-authenticate")).toBe('Bearer error="invalid_token"');
  });

  it("refuses a token without an audience when the API requires one", async () => {
    const { op, store } = await setup();
    await seed(store, {
      grantId: "grant-1",
      clientId: "web",
      subject: "user-1",
      scopes: ["openid", "data:read"],
      expiresAt: NOW_SECONDS + 60,
    });

    const failure = failureOf(await op.authenticate(apiRequest(`Bearer ${TOKEN}`), { audience: API }));

    expect(failure.reason).toBe("access_token_audience_mismatch");
  });

  it("accepts a token whose audience includes the API among several", async () => {
    const { op, store } = await setup();
    await seed(store, record({ audience: [DATA, API] }));

    const result = await op.authenticate(apiRequest(`Bearer ${TOKEN}`), { audience: API });

    expect(result.ok).toBe(true);
  });

  it("answers a missing scope with 403 insufficient_scope naming the required scopes, once each", async () => {
    const { op, store } = await setup();
    await seed(store);

    const failure = failureOf(
      await op.authenticate(apiRequest(`Bearer ${TOKEN}`), {
        audience: API,
        scopes: ["data:read", "data:write", "data:read"],
      }),
    );

    expect(failure.reason).toBe("access_token_scope_insufficient");
    expect(failure.issues).toEqual([{ code: "insufficient_scope" }]);
    expect(failure.clientId).toBe("web");
    expect(failure.response.status).toBe(403);
    expect(failure.response.headers.get("www-authenticate")).toBe(
      'Bearer error="insufficient_scope", scope="data:read data:write"',
    );
  });

  it("accepts a duplicate required scope the token carries", async () => {
    const { op, store } = await setup();
    await seed(store);

    const result = await op.authenticate(apiRequest(`Bearer ${TOKEN}`), { scopes: ["data:read", "data:read"] });

    expect(result.ok).toBe(true);
  });

  it("answers no-store and without CORS headers", async () => {
    const { op, store } = await setup();
    await seed(store);

    const failure = failureOf(await op.authenticate(apiRequest(`Bearer ${TOKEN}`), { scopes: ["data:write"] }));

    expect(failure.response.headers.get("cache-control")).toBe("no-store");
    expect(failure.response.headers.get("access-control-allow-origin")).toBeNull();
    expect(failure.response.headers.get("access-control-expose-headers")).toBeNull();
    expect(await failure.response.text()).toBe("");
  });

  it("never reports to onDiagnostic", async () => {
    const { op, store, diagnostics } = await setup();
    await seed(store, record({ expiresAt: NOW_SECONDS - 1 }));

    await op.authenticate(apiRequest());
    await op.authenticate(apiRequest("Basic x"));
    await op.authenticate(apiRequest(`Bearer ${TOKEN}`));
    await op.authenticate(apiRequest("Bearer unknown"));

    expect(diagnostics).toEqual([]);
  });

  it.each([
    ["not an object", "data:read"],
    ["an array", ["data:read"]],
    ["null", null],
    ["scopes that are not an array", { scopes: "data:read" }],
    ["a scope that is not a string", { scopes: [1] }],
    ["a scope that is not a scope token", { scopes: ['data"read'] }],
    ["an empty scope", { scopes: [""] }],
    ["an empty audience", { audience: "" }],
    ["an audience that is not a string", { audience: [API] }],
  ])("rejects options that are %s with a TypeError, before reading the store", async (_, options) => {
    const { op, store } = await setup();
    const find = vi.spyOn(store, "findAccessToken");

    await expect(op.authenticate(apiRequest(`Bearer ${TOKEN}`), options as never)).rejects.toThrow(TypeError);
    expect(find).not.toHaveBeenCalled();
  });

  it("rejects when the store does", async () => {
    const { op, store } = await setup();
    vi.spyOn(store, "findAccessToken").mockRejectedValue(new Error("store unavailable"));

    await expect(op.authenticate(apiRequest(`Bearer ${TOKEN}`))).rejects.toThrow("store unavailable");
  });
});

describe("authenticate with issued tokens", () => {
  it("authenticates the access token of a sign-in for the resource, and no other token it issued", async () => {
    const { op } = await setup();
    const issued = await signIn(op, [API]);

    const value = valueOf(
      await op.authenticate(apiRequest(`Bearer ${issued.access_token ?? ""}`), {
        audience: API,
        scopes: ["data:read"],
      }),
    );
    const idToken = failureOf(await op.authenticate(apiRequest(`Bearer ${issued.id_token ?? ""}`)));
    const refreshToken = failureOf(await op.authenticate(apiRequest(`Bearer ${issued.refresh_token ?? ""}`)));

    expect(value).toMatchObject({ clientId: "web", subject: "user-1", audience: [API] });
    expect(idToken.reason).toBe("access_token_unknown");
    expect(refreshToken.reason).toBe("access_token_unknown");
  });

  it("refuses the access token once the client revokes its grant", async () => {
    const { op } = await setup();
    const issued = await signIn(op, [API]);

    const revoked = await op.handle(
      new Request(`${ISSUER}/revoke`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: "web", token: issued.refresh_token ?? "" }).toString(),
      }),
    );
    expect(revoked?.status).toBe(200);
    const failure = failureOf(await op.authenticate(apiRequest(`Bearer ${issued.access_token ?? ""}`)));

    expect(failure.reason).toBe("access_token_unknown");
  });

  it("refuses an opaque token issued without resources when the API requires an audience", async () => {
    const { op } = await setup();
    const issued = await signIn(op, []);

    const failure = failureOf(
      await op.authenticate(apiRequest(`Bearer ${issued.access_token ?? ""}`), { audience: API }),
    );

    expect(failure.reason).toBe("access_token_audience_mismatch");
  });

  it("authenticates a JWT access token by its record, with the configured audience", async () => {
    const { op } = await setup({ format: "jwt", audience: API });
    const issued = await signIn(op, []);

    const value = valueOf(await op.authenticate(apiRequest(`Bearer ${issued.access_token ?? ""}`), { audience: API }));

    expect(value.audience).toEqual([API]);
  });
});
