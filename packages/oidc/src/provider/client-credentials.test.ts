import { generateKeyPair } from "@codenhub/jwt";
import { describe, expect, it } from "vitest";

import { digestKey } from "../shared/encoding";
import { type MemoryStore, createMemoryStore } from "../testing/memory-store";
import { createProvider } from "./create-provider";
import { generateClientSecret, hashClientSecret } from "./secrets";
import type { Provider, ProviderDiagnostic } from "./types";

const ISSUER = "https://op.example";
const NOW_MS = 1_800_000_000_000;
const NOW_SECONDS = NOW_MS / 1000;

interface Setup {
  readonly op: Provider;
  readonly store: MemoryStore;
  readonly secret: string;
  readonly diagnostics: ProviderDiagnostic[];
}

/** A provider with a machine client (`client_credentials` only), a client with both grants, and a sign-in client. */
async function setup(): Promise<Setup> {
  const secret = generateClientSecret();
  const auth = { method: "client_secret_basic", secretHash: await hashClientSecret(secret) } as const;
  const store = createMemoryStore({
    clients: [
      {
        clientId: "machine",
        redirectUris: [],
        scopes: ["orders:read", "orders:write"],
        auth,
        grantTypes: ["client_credentials"],
      },
      {
        clientId: "both",
        redirectUris: ["https://app.example/cb"],
        scopes: ["openid", "profile", "offline_access", "orders:read"],
        auth,
        grantTypes: ["authorization_code", "client_credentials"],
      },
      { clientId: "web", redirectUris: ["https://app.example/cb"], scopes: ["openid", "orders:read"], auth },
    ],
  });
  const diagnostics: ProviderDiagnostic[] = [];
  const op = createProvider({
    issuer: ISSUER,
    signingKeys: [await generateKeyPair({ alg: "ES256", kid: "k1" })],
    store,
    claims: () => ({}),
    scopes: { "orders:read": [], "orders:write": [] },
    now: () => NOW_MS,
    onDiagnostic: (diagnostic) => {
      diagnostics.push(diagnostic);
    },
  });
  return { op, store, secret, diagnostics };
}

const basic = (clientId: string, secret: string): string =>
  `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`;

function post(path: string, clientId: string, secret: string, body: Record<string, string>): Request {
  return new Request(`${ISSUER}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: basic(clientId, secret) },
    body: new URLSearchParams(body).toString(),
  });
}

const tokenRequest = (clientId: string, secret: string, body: Record<string, string>): Request =>
  post("/token", clientId, secret, { grant_type: "client_credentials", ...body });

async function handled(op: Provider, request: Request): Promise<Response> {
  const response = await op.handle(request);
  if (response === null) {
    throw new Error("the provider did not route the request");
  }
  return response;
}

describe("client_credentials", () => {
  it("issues an access token for every scope of the client when none is requested", async () => {
    const { op, store, secret } = await setup();

    const response = await handled(op, tokenRequest("machine", secret, {}));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(Object.keys(body).sort()).toEqual(["access_token", "expires_in", "scope", "token_type"]);
    expect(body).toMatchObject({ token_type: "Bearer", expires_in: 600, scope: "orders:read orders:write" });
    const record = await store.findAccessToken(await digestKey(body.access_token as string));
    expect(record).toMatchObject({
      clientId: "machine",
      subject: "machine",
      scopes: ["orders:read", "orders:write"],
      expiresAt: NOW_SECONDS + 600,
    });
  });

  it("leaves the protocol scopes out of the default for a client that also signs users in", async () => {
    const { op, secret } = await setup();

    const response = await handled(op, tokenRequest("both", secret, {}));

    expect(await response.json()).toMatchObject({ scope: "profile orders:read" });
  });

  it("narrows to the requested scopes", async () => {
    const { op, secret } = await setup();

    const response = await handled(op, tokenRequest("machine", secret, { scope: "orders:write" }));

    expect(await response.json()).toMatchObject({ scope: "orders:write" });
  });

  it.each([
    ["openid", "openid orders:read"],
    ["offline_access", "orders:read offline_access"],
    ["a scope the client may not request", "orders:read orders:write"],
    ["a scope the provider does not define", "orders:delete"],
    ["an empty scope from a double space", "orders:read  orders:write"],
  ])("refuses %s with invalid_scope", async (_name, scope) => {
    const { op, secret } = await setup();

    const response = await handled(op, tokenRequest("both", secret, { scope }));

    expect(response.status).toBe(400);
    expect(await response.text()).toBe(JSON.stringify({ error: "invalid_scope" }));
  });

  it("refuses a client without the grant with unauthorized_client, and says why to the operator", async () => {
    const { op, secret, diagnostics } = await setup();

    const response = await handled(op, tokenRequest("web", secret, {}));

    expect(response.status).toBe(400);
    expect(await response.text()).toBe(JSON.stringify({ error: "unauthorized_client" }));
    expect(diagnostics).toEqual([
      { endpoint: "token", reason: "grant_type_unauthorized", status: 400, clientId: "web" },
    ]);
  });

  it.each([
    [
      "authorization_code",
      { grant_type: "authorization_code", code: "c", redirect_uri: "https://x/cb", code_verifier: "v".repeat(43) },
    ],
    ["refresh_token", { grant_type: "refresh_token", refresh_token: "r" }],
  ])("refuses %s from a client registered for client_credentials only", async (_name, body) => {
    const { op, secret } = await setup();

    const response = await handled(op, post("/token", "machine", secret, body));

    expect(await response.text()).toBe(JSON.stringify({ error: "unauthorized_client" }));
  });

  it("refuses a wrong secret with invalid_client", async () => {
    const { op } = await setup();

    const response = await handled(op, tokenRequest("machine", generateClientSecret(), {}));

    expect(response.status).toBe(401);
    expect(await response.text()).toBe(JSON.stringify({ error: "invalid_client" }));
  });

  it("issues a token the userinfo endpoint refuses, since it has no openid", async () => {
    const { op, secret } = await setup();
    const { access_token: accessToken } = (await (await handled(op, tokenRequest("machine", secret, {}))).json()) as {
      access_token: string;
    };

    const response = await handled(
      op,
      new Request(`${ISSUER}/userinfo`, { headers: { authorization: `Bearer ${accessToken}` } }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("www-authenticate")).toBe('Bearer error="insufficient_scope"');
  });

  it("gives each token its own grant, so revoking one leaves the others", async () => {
    const { op, store, secret } = await setup();
    const issue = async (): Promise<string> =>
      ((await (await handled(op, tokenRequest("machine", secret, {}))).json()) as { access_token: string })
        .access_token;
    const first = await issue();
    const second = await issue();

    const revoked = await handled(op, post("/revoke", "machine", secret, { token: first }));

    expect(revoked.status).toBe(200);
    expect(await store.findAccessToken(await digestKey(first))).toBeUndefined();
    expect(await store.findAccessToken(await digestKey(second))).toBeDefined();
  });

  it("is advertised in discovery", async () => {
    const { op } = await setup();

    expect(op.metadata.grant_types_supported).toContain("client_credentials");
  });
});

describe("authorization requests from a client_credentials client", () => {
  it("redirects with unauthorized_client when the client has a redirect URI but not the code grant", async () => {
    const secret = generateClientSecret();
    const op = createProvider({
      issuer: ISSUER,
      signingKeys: [await generateKeyPair({ alg: "ES256", kid: "k1" })],
      store: createMemoryStore({
        clients: [
          {
            clientId: "machine",
            redirectUris: ["https://app.example/cb"],
            scopes: ["orders:read"],
            auth: { method: "client_secret_basic", secretHash: await hashClientSecret(secret) },
            grantTypes: ["client_credentials"],
          },
        ],
      }),
      claims: () => ({}),
      scopes: { "orders:read": [] },
    });
    const query = new URLSearchParams({
      client_id: "machine",
      redirect_uri: "https://app.example/cb",
      response_type: "code",
      scope: "openid",
      state: "s1",
      code_challenge: "a".repeat(43),
      code_challenge_method: "S256",
    });

    const result = await op.beginAuthorization(new Request(`${ISSUER}/authorize?${query}`));

    expect(!result.ok && result.error.issues).toEqual([{ code: "unauthorized_client" }]);
    expect(!result.ok && result.error.redirect?.headers.get("location")).toBe(
      `https://app.example/cb?error=unauthorized_client&state=s1&iss=${encodeURIComponent(ISSUER)}`,
    );
  });
});
