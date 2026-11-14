import { generateKeyPair } from "@codenhub/jwt";
import { describe, expect, it } from "vitest";

import { digestKey } from "../shared/encoding";
import { computeCodeChallenge } from "../shared/pkce";
import type { OidcResult } from "../shared/types";
import { type MemoryStore, createMemoryStore } from "../testing/memory-store";
import { createProvider } from "./create-provider";
import { generateClientSecret, hashClientSecret } from "./secrets";
import type {
  AccessTokenFormat,
  AccessTokenRecord,
  AuthorizationFailure,
  AuthorizationInteraction,
  Provider,
  ProviderOptions,
} from "./types";

const ISSUER = "https://op.example";
const REDIRECT_URI = "https://app.example/cb";
const VERIFIER = "v".repeat(43);
const NOW_MS = 1_800_000_000_000;
const NOW_SECONDS = NOW_MS / 1000;
const API = "https://api.example";
const DATA = "urn:example:data";
const DEFAULT_AUDIENCE = "https://default.example";

interface Setup {
  readonly op: Provider;
  readonly store: MemoryStore;
  readonly secret: string;
}

const WEB_CLIENT = {
  clientId: "web",
  redirectUris: [REDIRECT_URI],
  scopes: ["openid", "profile", "offline_access"],
  auth: { method: "none" },
} as const;

async function setup(
  accessToken: AccessTokenFormat = { format: "opaque" },
  extra: Partial<ProviderOptions> = {},
): Promise<Setup> {
  const secret = generateClientSecret();
  const store = createMemoryStore({
    clients: [
      { ...WEB_CLIENT, resources: [API, DATA] },
      {
        clientId: "plain",
        redirectUris: [REDIRECT_URI],
        scopes: ["openid", "offline_access"],
        auth: { method: "none" },
      },
      {
        clientId: "service",
        redirectUris: [],
        scopes: ["data:read"],
        auth: { method: "client_secret_post", secretHashes: [await hashClientSecret(secret)] },
        grantTypes: ["client_credentials"],
        resources: [API, DATA],
      },
    ],
  });
  const op = createProvider({
    issuer: ISSUER,
    signingKeys: [await generateKeyPair({ alg: "ES256", kid: "k1" })],
    store,
    claims: () => ({}),
    accessToken,
    now: () => NOW_MS,
    ...extra,
  });
  return { op, store, secret };
}

/** An authorization request for `client`, with each of `resources` as its own `resource` parameter. */
async function authorizeRequest(client: string, resources: readonly string[], extra = ""): Promise<Request> {
  const parameters = new URLSearchParams({
    response_type: "code",
    client_id: client,
    redirect_uri: REDIRECT_URI,
    scope: "openid offline_access",
    state: "state-1",
    code_challenge: await computeCodeChallenge(VERIFIER),
    code_challenge_method: "S256",
  });
  for (const resource of resources) {
    parameters.append("resource", resource);
  }
  return new Request(`${ISSUER}/authorize?${parameters.toString()}${extra}`);
}

async function begin(op: Provider, client: string, resources: readonly string[]): Promise<AuthorizationInteraction> {
  const result = await op.beginAuthorization(await authorizeRequest(client, resources));
  if (!result.ok) {
    throw new Error(`expected the request to pass: ${result.error.issues[0].code}`);
  }
  return result.value;
}

function failureOf(result: OidcResult<unknown, AuthorizationFailure>): AuthorizationFailure {
  if (result.ok) {
    throw new Error("expected the request to fail");
  }
  return result.error;
}

/** Signs the user in through the authorization step, and returns the code the client receives. */
async function codeFor(op: Provider, client: string, resources: readonly string[]): Promise<string> {
  const interaction = await begin(op, client, resources);
  const completed = await op.completeAuthorization(interaction.id, {
    subject: "user-1",
    authTime: NOW_SECONDS - 10,
    scopes: ["openid", "offline_access"],
  });
  if (!completed.ok) {
    throw new Error("expected the grant to complete");
  }
  return new URL(completed.value.headers.get("location") ?? "").searchParams.get("code") ?? "";
}

/** A form POST to the token endpoint; a value given as a list repeats its parameter. */
function tokenRequest(body: Readonly<Record<string, string | readonly string[]>>): Request {
  const parameters = new URLSearchParams();
  for (const [name, value] of Object.entries(body)) {
    for (const entry of typeof value === "string" ? [value] : value) {
      parameters.append(name, entry);
    }
  }
  return new Request(`${ISSUER}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: parameters.toString(),
  });
}

const codeBody = (code: string, resource?: readonly string[]): Record<string, string | readonly string[]> => ({
  grant_type: "authorization_code",
  client_id: "web",
  code,
  redirect_uri: REDIRECT_URI,
  code_verifier: VERIFIER,
  ...(resource === undefined ? {} : { resource }),
});

const refreshBody = (
  refreshToken: string,
  resource?: readonly string[],
): Record<string, string | readonly string[]> => ({
  grant_type: "refresh_token",
  client_id: "web",
  refresh_token: refreshToken,
  ...(resource === undefined ? {} : { resource }),
});

async function tokens(op: Provider, request: Request): Promise<Record<string, string>> {
  const response = await op.handle(request);
  expect(response?.status).toBe(200);
  return (await response?.json()) as Record<string, string>;
}

async function errorOf(op: Provider, request: Request): Promise<{ status: number; error: unknown }> {
  const response = await op.handle(request);
  const body = (await response?.json()) as { error?: unknown };
  return { status: response?.status ?? 0, error: body.error };
}

async function recordOf(store: MemoryStore, accessToken: string): Promise<AccessTokenRecord | undefined> {
  return store.findAccessToken(await digestKey(accessToken));
}

const payloadOf = (token: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>;

describe("resource indicators at authorization", () => {
  it("puts every resource on the interaction, once each, in the order sent", async () => {
    const { op } = await setup();

    const interaction = await begin(op, "web", [DATA, API, DATA]);

    expect(interaction.resources).toEqual([DATA, API]);
  });

  it("leaves resources off an interaction whose request named none", async () => {
    const { op } = await setup();

    const interaction = await begin(op, "web", []);

    expect(interaction).not.toHaveProperty("resources");
  });

  it.each([
    ["a resource the client's list lacks", "web", ["https://other.example"]],
    ["one resource of several outside the list", "web", [API, "https://other.example"]],
    ["a listed resource with a fragment", "web", [`${API}#x`]],
    ["a listed resource with a trailing slash", "web", [`${API}/`]],
    ["a relative resource", "web", ["/api"]],
    ["any resource from a client without a list", "plain", [API]],
  ])("redirects with invalid_target for %s", async (_, client, resources) => {
    const { op } = await setup();

    const result = await op.beginAuthorization(await authorizeRequest(client, resources));

    const failure = failureOf(result);
    expect(failure.issues).toEqual([{ code: "invalid_target" }]);
    const location = new URL(failure.redirect?.headers.get("location") ?? "");
    expect(location.searchParams.get("error")).toBe("invalid_target");
    expect(location.searchParams.get("state")).toBe("state-1");
  });

  it("still refuses a repeated scope while resource may repeat", async () => {
    const { op } = await setup();

    const result = await op.beginAuthorization(await authorizeRequest("web", [API, DATA], "&scope=openid"));

    const failure = failureOf(result);
    expect(failure.issues).toEqual([{ code: "invalid_request", params: { reason: "duplicate" } }]);
    expect(failure.redirect).toBeNull();
  });

  it("ignores an empty resource, as it does any empty parameter", async () => {
    const { op } = await setup();

    const interaction = await begin(op, "plain", [""]);

    expect(interaction).not.toHaveProperty("resources");
  });
});

describe("resource indicators at the token endpoint", () => {
  it("issues a token for every resource of the grant when the request names none", async () => {
    const { op, store } = await setup();
    const code = await codeFor(op, "web", [API, DATA]);

    const body = await tokens(op, tokenRequest(codeBody(code)));

    expect((await recordOf(store, body.access_token ?? ""))?.audience).toEqual([API, DATA]);
  });

  it("narrows a token to the resources the request names", async () => {
    const { op, store } = await setup();
    const code = await codeFor(op, "web", [API, DATA]);

    const body = await tokens(op, tokenRequest(codeBody(code, [DATA])));

    expect((await recordOf(store, body.access_token ?? ""))?.audience).toEqual([DATA]);
  });

  it("leaves an opaque token of a grant without resources with no audience", async () => {
    const { op, store } = await setup();
    const code = await codeFor(op, "web", []);

    const body = await tokens(op, tokenRequest(codeBody(code)));

    expect(await recordOf(store, body.access_token ?? "")).not.toHaveProperty("audience");
  });

  it("refuses a resource outside the client's list before spending the code", async () => {
    const { op } = await setup();
    const code = await codeFor(op, "web", [API]);

    expect(await errorOf(op, tokenRequest(codeBody(code, ["https://other.example"])))).toEqual({
      status: 400,
      error: "invalid_target",
    });
    await tokens(op, tokenRequest(codeBody(code)));
  });

  it("refuses a resource the grant does not cover, and spends the code", async () => {
    const { op } = await setup();
    const code = await codeFor(op, "web", [API]);

    expect(await errorOf(op, tokenRequest(codeBody(code, [DATA])))).toEqual({ status: 400, error: "invalid_target" });
    expect(await errorOf(op, tokenRequest(codeBody(code)))).toEqual({ status: 400, error: "invalid_grant" });
  });

  it("refuses any resource at a code exchange of a grant that named none", async () => {
    const { op } = await setup();
    const code = await codeFor(op, "web", []);

    expect(await errorOf(op, tokenRequest(codeBody(code, [API])))).toEqual({ status: 400, error: "invalid_target" });
  });

  it("keeps the family's resources through rotation, and lets a refresh narrow but not widen them", async () => {
    const { op, store } = await setup();
    const code = await codeFor(op, "web", [API, DATA]);
    const first = await tokens(op, tokenRequest(codeBody(code, [API])));

    const narrowed = await tokens(op, tokenRequest(refreshBody(first.refresh_token ?? "", [DATA])));
    const full = await tokens(op, tokenRequest(refreshBody(narrowed.refresh_token ?? "")));

    expect((await recordOf(store, narrowed.access_token ?? ""))?.audience).toEqual([DATA]);
    expect((await recordOf(store, full.access_token ?? ""))?.audience).toEqual([API, DATA]);
  });

  it("refuses a refresh for a resource the family does not cover, and spends the token", async () => {
    const { op } = await setup();
    const code = await codeFor(op, "web", [API]);
    const first = await tokens(op, tokenRequest(codeBody(code)));
    const refreshToken = first.refresh_token ?? "";

    expect(await errorOf(op, tokenRequest(refreshBody(refreshToken, [DATA])))).toEqual({
      status: 400,
      error: "invalid_target",
    });
    expect(await errorOf(op, tokenRequest(refreshBody(refreshToken)))).toEqual({ status: 400, error: "invalid_grant" });
  });

  it("refuses a refresh for a resource outside the client's list without spending the token", async () => {
    const { op } = await setup();
    const code = await codeFor(op, "web", [API]);
    const first = await tokens(op, tokenRequest(codeBody(code)));
    const refreshToken = first.refresh_token ?? "";

    expect(await errorOf(op, tokenRequest(refreshBody(refreshToken, [`${API}#x`])))).toEqual({
      status: 400,
      error: "invalid_target",
    });
    await tokens(op, tokenRequest(refreshBody(refreshToken)));
  });

  it("issues a client credentials token for the resources it names, and refuses one outside the list", async () => {
    const { op, store, secret } = await setup();
    const request = (resource: readonly string[]): Request =>
      tokenRequest({ grant_type: "client_credentials", client_id: "service", client_secret: secret, resource });

    const body = await tokens(op, request([API, DATA, API]));

    expect((await recordOf(store, body.access_token ?? ""))?.audience).toEqual([API, DATA]);
    expect(await errorOf(op, request(["https://other.example"]))).toEqual({ status: 400, error: "invalid_target" });
  });

  it("still refuses a repeated parameter other than resource at the token endpoint", async () => {
    const { op } = await setup();
    const code = await codeFor(op, "web", [API]);

    const request = tokenRequest({ ...codeBody(code, [API, API]), redirect_uri: [REDIRECT_URI, REDIRECT_URI] });

    expect(await errorOf(op, request)).toEqual({ status: 400, error: "invalid_request" });
  });
});

describe("resource indicators in JWT access tokens", () => {
  it("puts one resource in aud as a string", async () => {
    const { op, store } = await setup({ format: "jwt", audience: DEFAULT_AUDIENCE });
    const code = await codeFor(op, "web", [API]);

    const body = await tokens(op, tokenRequest(codeBody(code)));

    expect(payloadOf(body.access_token ?? "").aud).toBe(API);
    expect((await recordOf(store, body.access_token ?? ""))?.audience).toEqual([API]);
  });

  it("puts several resources in aud as an array", async () => {
    const { op } = await setup({ format: "jwt", audience: DEFAULT_AUDIENCE });
    const code = await codeFor(op, "web", [API, DATA]);

    const body = await tokens(op, tokenRequest(codeBody(code)));

    expect(payloadOf(body.access_token ?? "").aud).toEqual([API, DATA]);
  });

  it("keeps the configured audience for a grant without resources, and records it", async () => {
    const { op, store } = await setup({ format: "jwt", audience: DEFAULT_AUDIENCE });
    const code = await codeFor(op, "web", []);

    const body = await tokens(op, tokenRequest(codeBody(code)));

    expect(payloadOf(body.access_token ?? "").aud).toBe(DEFAULT_AUDIENCE);
    expect((await recordOf(store, body.access_token ?? ""))?.audience).toEqual([DEFAULT_AUDIENCE]);
  });
});

describe("resource narrowing at a refresh that names no resource", () => {
  /** Signs in for both resources, and returns the first refresh token of the family. */
  async function family(op: Provider): Promise<string> {
    const code = await codeFor(op, "web", [API, DATA]);
    return (await tokens(op, tokenRequest(codeBody(code)))).refresh_token ?? "";
  }

  it("leaves out a resource removed from the client's list, and restores it once it is listed again", async () => {
    const { op, store } = await setup();
    const first = await family(op);

    store.addClient({ ...WEB_CLIENT, resources: [API] });
    const narrowed = await tokens(op, tokenRequest(refreshBody(first)));
    store.addClient({ ...WEB_CLIENT, resources: [DATA, API] });
    const restored = await tokens(op, tokenRequest(refreshBody(narrowed.refresh_token ?? "")));

    expect((await recordOf(store, narrowed.access_token ?? ""))?.audience).toEqual([API]);
    expect((await recordOf(store, restored.access_token ?? ""))?.audience).toEqual([API, DATA]);
  });

  it("gives accessTokenClaims and the JWT the narrowed audience", async () => {
    const seen: unknown[] = [];
    const { op, store } = await setup(
      { format: "jwt", audience: DEFAULT_AUDIENCE },
      {
        accessTokenClaims: (context) => {
          seen.push(context.audience);
          return {};
        },
      },
    );
    const first = await family(op);
    seen.length = 0;

    store.addClient({ ...WEB_CLIENT, resources: [DATA] });
    const body = await tokens(op, tokenRequest(refreshBody(first)));

    expect(payloadOf(body.access_token ?? "").aud).toBe(DATA);
    expect(seen).toEqual([[DATA]]);
  });

  it("falls back as a grant without resources does when the client lists none of the family's", async () => {
    const opaque = await setup();
    const jwt = await setup({ format: "jwt", audience: DEFAULT_AUDIENCE });
    const opaqueFirst = await family(opaque.op);
    const jwtFirst = await family(jwt.op);

    opaque.store.addClient({ ...WEB_CLIENT, resources: ["https://other.example"] });
    jwt.store.addClient({ ...WEB_CLIENT });
    const opaqueBody = await tokens(opaque.op, tokenRequest(refreshBody(opaqueFirst)));
    const jwtBody = await tokens(jwt.op, tokenRequest(refreshBody(jwtFirst)));

    expect((await recordOf(opaque.store, opaqueBody.access_token ?? ""))?.audience).toBeUndefined();
    expect(payloadOf(jwtBody.access_token ?? "").aud).toBe(DEFAULT_AUDIENCE);
    expect((await recordOf(jwt.store, jwtBody.access_token ?? ""))?.audience).toEqual([DEFAULT_AUDIENCE]);
  });

  it("keeps the family's resources, so a refresh may still name one the client lists", async () => {
    const { op, store } = await setup();
    const first = await family(op);

    store.addClient({ ...WEB_CLIENT });
    const emptied = await tokens(op, tokenRequest(refreshBody(first)));
    store.addClient({ ...WEB_CLIENT, resources: [API, DATA] });
    const named = await tokens(op, tokenRequest(refreshBody(emptied.refresh_token ?? "", [DATA])));

    expect((await recordOf(store, named.access_token ?? ""))?.audience).toEqual([DATA]);
  });

  it("refuses a named resource removed from the client's list without spending the token", async () => {
    const { op, store } = await setup();
    const first = await family(op);

    store.addClient({ ...WEB_CLIENT, resources: [API] });

    expect(await errorOf(op, tokenRequest(refreshBody(first, [DATA])))).toEqual({
      status: 400,
      error: "invalid_target",
    });
    await tokens(op, tokenRequest(refreshBody(first)));
  });
});
