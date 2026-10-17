import { describe, expect, it } from "vitest";

import type { ProviderMetadata } from "../shared/types";
import { createClient } from "./create-client";
import type { ClientOptions } from "./types";

const ISSUER = "https://op.example";

const metadata: ProviderMetadata = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/authorize`,
  token_endpoint: `${ISSUER}/token`,
  jwks_uri: `${ISSUER}/jwks`,
  response_types_supported: ["code"],
  subject_types_supported: ["public"],
  id_token_signing_alg_values_supported: ["ES256"],
  grant_types_supported: ["authorization_code", "refresh_token", "client_credentials"],
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A token endpoint that records each request and answers with `reply`. */
function tokenEndpoint(
  reply: () => Response = () =>
    json({ access_token: "at-1", token_type: "Bearer", expires_in: 300, scope: "orders:read" }),
) {
  const requests: Request[] = [];
  const fetchFunction = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    requests.push(new Request(input, init));
    return reply();
  }) as typeof fetch;
  return { requests, fetch: fetchFunction };
}

/** A service client: no redirect URI, authenticating with client_secret_basic. */
const serviceClient = (fetchFunction: typeof fetch, overrides: Partial<ClientOptions> = {}) =>
  createClient({
    metadata,
    clientId: "service",
    auth: { method: "client_secret_basic", secret: "s3cret" },
    fetch: fetchFunction,
    now: () => 1_800_000_000_000,
    ...overrides,
  });

describe("clientCredentials", () => {
  it("sends the grant with the client's credentials and the requested scope", async () => {
    const endpoint = tokenEndpoint();

    const result = await serviceClient(endpoint.fetch).clientCredentials({ scope: ["orders:read", "orders:read"] });

    expect(result).toEqual({
      ok: true,
      value: { accessToken: "at-1", tokenType: "Bearer", expiresAt: 1_800_000_300, scope: ["orders:read"] },
    });
    const [request] = endpoint.requests;
    expect(request?.url).toBe(`${ISSUER}/token`);
    expect(request?.headers.get("authorization")).toBe(`Basic ${btoa("service:s3cret")}`);
    expect(await request?.text()).toBe("grant_type=client_credentials&scope=orders%3Aread");
  });

  it("leaves scope out when none is asked for", async () => {
    const endpoint = tokenEndpoint();

    await serviceClient(endpoint.fetch).clientCredentials();

    expect(await endpoint.requests[0]?.text()).toBe("grant_type=client_credentials");
  });

  it("drops an id_token from the response, since nothing checks it", async () => {
    const endpoint = tokenEndpoint(() => json({ access_token: "at-1", token_type: "Bearer", id_token: "a.b.c" }));

    const result = await serviceClient(endpoint.fetch).clientCredentials();

    expect(result.ok).toBe(true);
    expect(result.ok && Object.hasOwn(result.value, "idToken")).toBe(false);
  });

  it("drops a refresh_token from the response, since the grant has none", async () => {
    const endpoint = tokenEndpoint(() => json({ access_token: "at-1", token_type: "Bearer", refresh_token: "rt-1" }));

    const result = await serviceClient(endpoint.fetch).clientCredentials();

    expect(result.ok).toBe(true);
    expect(result.ok && Object.hasOwn(result.value, "refreshToken")).toBe(false);
    expect(result.ok && result.value.accessToken).toBe("at-1");
  });

  it("reports a provider error as provider_error", async () => {
    const endpoint = tokenEndpoint(() => json({ error: "unauthorized_client" }, 400));

    const result = await serviceClient(endpoint.fetch).clientCredentials();

    expect(!result.ok && result.error.issues).toEqual([
      { code: "provider_error", params: { endpoint: "token", error: "unauthorized_client" } },
    ]);
  });

  it("throws a TypeError for a public client", async () => {
    const client = serviceClient(tokenEndpoint().fetch, { auth: { method: "none" } });
    const attempt = client.clientCredentials();

    await expect(attempt).rejects.toThrow(TypeError);
    await expect(attempt).rejects.toThrow("auth.method is none");
  });

  it("throws a TypeError when the provider does not list the grant", async () => {
    const client = serviceClient(tokenEndpoint().fetch, {
      metadata: { ...metadata, grant_types_supported: ["authorization_code"] },
    });

    const attempt = client.clientCredentials();

    await expect(attempt).rejects.toThrow(TypeError);
    await expect(attempt).rejects.toThrow("grant_types_supported");
  });

  it.each([
    ["an empty list", []],
    ["a scope with a space", ["orders read"]],
    ["a non-array", "orders:read"],
  ])("throws a TypeError for a scope that is %s", async (_name, scope) => {
    const client = serviceClient(tokenEndpoint().fetch);

    const attempt = client.clientCredentials({ scope: scope as readonly string[] });

    await expect(attempt).rejects.toThrow(TypeError);
    await expect(attempt).rejects.toThrow("clientCredentials: scope");
  });
});

describe("a client without a redirect URI", () => {
  it("throws a TypeError from authorize and callback, which sign users in", async () => {
    const client = serviceClient(tokenEndpoint().fetch, { auth: { method: "none" } });
    const pending = { state: "s", nonce: "n", codeVerifier: "v".repeat(43) };

    const authorize = client.authorize();

    await expect(authorize).rejects.toThrow(TypeError);
    await expect(authorize).rejects.toThrow("authorize: createClient needs a redirectUri");

    const callback = client.callback("https://app.example/cb?state=s&code=c", pending);

    await expect(callback).rejects.toThrow(TypeError);
    await expect(callback).rejects.toThrow("callback: createClient needs a redirectUri");
  });
});
