import { generateKeyPair } from "@codenhub/jwt";
import { describe, expect, it, vi } from "vitest";

import { computeCodeChallenge } from "../shared/pkce";
import { type MemoryStore, createMemoryStore } from "../testing/memory-store";
import { createProvider } from "./create-provider";
import { generateClientSecret, hashClientSecret } from "./secrets";
import type { AccessTokenClaimsRequest, Provider, ProviderOptions } from "./types";

const ISSUER = "https://op.example";
const REDIRECT_URI = "https://app.example/cb";
const VERIFIER = "v".repeat(43);
const NOW_MS = 1_800_000_000_000;
const NOW_SECONDS = NOW_MS / 1000;
const API = "https://api.example";
const DEFAULT_AUDIENCE = "https://default.example";

type AccessTokenClaims = NonNullable<ProviderOptions["accessTokenClaims"]>;

interface Setup {
  readonly op: Provider;
  readonly store: MemoryStore;
  readonly secret: string;
}

async function setup(accessTokenClaims: AccessTokenClaims): Promise<Setup> {
  const secret = generateClientSecret();
  const store = createMemoryStore({
    clients: [
      {
        clientId: "web",
        redirectUris: [REDIRECT_URI],
        scopes: ["openid", "offline_access", "data:read"],
        auth: { method: "none" },
        resources: [API],
      },
      {
        clientId: "service",
        redirectUris: [],
        scopes: ["data:read"],
        auth: { method: "client_secret_post", secretHashes: [await hashClientSecret(secret)] },
        grantTypes: ["client_credentials"],
        resources: [API],
      },
    ],
  });
  const op = createProvider({
    issuer: ISSUER,
    signingKeys: [await generateKeyPair({ alg: "ES256", kid: "k1" })],
    store,
    claims: () => ({}),
    accessToken: { format: "jwt", audience: DEFAULT_AUDIENCE },
    accessTokenClaims,
    now: () => NOW_MS,
  });
  return { op, store, secret };
}

function tokenRequest(body: Readonly<Record<string, string>>): Request {
  return new Request(`${ISSUER}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
}

/** Signs the user in for `resource`, when given, and returns the code exchange's token request. */
async function codeRequest(op: Provider, resource?: string): Promise<Request> {
  const parameters = new URLSearchParams({
    response_type: "code",
    client_id: "web",
    redirect_uri: REDIRECT_URI,
    scope: "openid offline_access data:read",
    state: "state-1",
    code_challenge: await computeCodeChallenge(VERIFIER),
    code_challenge_method: "S256",
    ...(resource === undefined ? {} : { resource }),
  });
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
  return tokenRequest({
    grant_type: "authorization_code",
    client_id: "web",
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: VERIFIER,
  });
}

async function tokens(op: Provider, request: Request): Promise<Record<string, string>> {
  const response = await op.handle(request);
  expect(response?.status).toBe(200);
  return (await response?.json()) as Record<string, string>;
}

const refreshRequest = (refreshToken: string): Request =>
  tokenRequest({ grant_type: "refresh_token", client_id: "web", refresh_token: refreshToken });

const payloadOf = (token: string | undefined): Record<string, unknown> =>
  JSON.parse(Buffer.from((token ?? "").split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>;

describe("accessTokenClaims", () => {
  it("adds the app's claims to the access token of a code exchange, and not to the ID token", async () => {
    const accessTokenClaims = vi.fn<AccessTokenClaims>(() => ({ roles: ["editor"], tenant: "t-1" }));
    const { op } = await setup(accessTokenClaims);

    const issued = await tokens(op, await codeRequest(op, API));

    const payload = payloadOf(issued.access_token);
    expect(payload.roles).toEqual(["editor"]);
    expect(payload.tenant).toBe("t-1");
    expect(payloadOf(issued.id_token)).not.toHaveProperty("roles");
    expect(accessTokenClaims).toHaveBeenCalledTimes(1);
  });

  it("asks with a frozen request naming the token's subject, client, scopes, audience and grant", async () => {
    const requests: AccessTokenClaimsRequest[] = [];
    const { op } = await setup((request) => {
      requests.push(request);
      return {};
    });

    await tokens(op, await codeRequest(op, API));

    const [request] = requests;
    expect(request).toEqual({
      subject: "user-1",
      clientId: "web",
      scopes: ["openid", "offline_access", "data:read"],
      audience: [API],
      grantId: expect.any(String),
    });
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request?.scopes)).toBe(true);
    expect(Object.isFrozen(request?.audience)).toBe(true);
  });

  it("asks with the provider's audience when the sign-in named no resource", async () => {
    const audiences: (readonly string[])[] = [];
    const { op } = await setup(({ audience }) => {
      audiences.push(audience);
      return {};
    });

    await tokens(op, await codeRequest(op));

    expect(audiences).toEqual([[DEFAULT_AUDIENCE]]);
  });

  it("never replaces or adds a claim the provider sets or could set", async () => {
    const { op } = await setup(() => ({
      iss: "https://evil.example",
      exp: 1,
      aud: "https://evil.example",
      sub: "admin",
      client_id: "other",
      iat: 1,
      jti: "fixed",
      scope: "admin",
      auth_time: 1,
      acr: "urn:mfa",
      amr: ["mfa"],
      nbf: 1,
      cnf: { jkt: "x" },
      azp: "other",
      roles: ["viewer"],
    }));

    const payload = payloadOf((await tokens(op, await codeRequest(op, API))).access_token);

    expect(payload).toMatchObject({
      iss: ISSUER,
      aud: API,
      sub: "user-1",
      client_id: "web",
      scope: "openid offline_access data:read",
      auth_time: NOW_SECONDS - 10,
      roles: ["viewer"],
    });
    expect(payload.jti).not.toBe("fixed");
    expect(payload.exp).toBeGreaterThan(NOW_SECONDS);
    for (const name of ["acr", "amr", "nbf", "cnf", "azp"]) {
      expect(payload).not.toHaveProperty(name);
    }
  });

  it("reads only own enumerable data properties, without running a getter", async () => {
    const getter = vi.fn(() => "from-getter");
    const { op } = await setup(() => {
      const claims = Object.create({ inherited: "x" }) as Record<string, unknown>;
      Object.defineProperty(claims, "computed", { enumerable: true, get: getter });
      Object.defineProperty(claims, "hidden", { enumerable: false, value: "x" });
      Object.defineProperty(claims, "__proto__", { enumerable: true, value: "plain", configurable: true });
      claims.missing = undefined;
      claims.kept = "yes";
      return claims;
    });

    const payload = payloadOf((await tokens(op, await codeRequest(op, API))).access_token);

    expect(getter).not.toHaveBeenCalled();
    expect(Object.keys(payload)).not.toContain("computed");
    expect(payload).not.toHaveProperty("inherited");
    expect(payload).not.toHaveProperty("hidden");
    expect(payload).not.toHaveProperty("missing");
    expect(Object.hasOwn(payload, "__proto__")).toBe(true);
    expect(payload.kept).toBe("yes");
  });

  it("awaits a promise", async () => {
    const { op } = await setup(() => Promise.resolve({ roles: ["owner"] }));

    const payload = payloadOf((await tokens(op, await codeRequest(op, API))).access_token);

    expect(payload.roles).toEqual(["owner"]);
  });

  it("is asked again at each refresh, for the refreshed token", async () => {
    let calls = 0;
    const { op } = await setup(() => {
      calls += 1;
      return { generation: calls };
    });
    const issued = await tokens(op, await codeRequest(op, API));

    const refreshed = await tokens(op, refreshRequest(issued.refresh_token ?? ""));

    expect(payloadOf(refreshed.access_token).generation).toBe(2);
    expect(payloadOf(refreshed.access_token).aud).toBe(API);
  });

  it("fails a refresh before the next refresh token is saved, and the retry is a reuse", async () => {
    let fail = false;
    const { op, store } = await setup(() => {
      if (fail) {
        throw new Error("roles unavailable");
      }
      return {};
    });
    const issued = await tokens(op, await codeRequest(op, API));
    const save = vi.spyOn(store, "saveRefreshToken");
    fail = true;

    await expect(op.handle(refreshRequest(issued.refresh_token ?? ""))).rejects.toThrow("roles unavailable");
    expect(save).not.toHaveBeenCalled();
    fail = false;
    const retry = await op.handle(refreshRequest(issued.refresh_token ?? ""));

    expect(retry?.status).toBe(400);
    expect(await retry?.json()).toEqual({ error: "invalid_grant" });
  });

  it("is asked for a client credentials token, whose subject is the client", async () => {
    const requests: AccessTokenClaimsRequest[] = [];
    const { op, secret } = await setup((request) => {
      requests.push(request);
      return { tier: "internal" };
    });

    const issued = await tokens(
      op,
      tokenRequest({ grant_type: "client_credentials", client_id: "service", client_secret: secret, resource: API }),
    );

    expect(payloadOf(issued.access_token).tier).toBe("internal");
    expect(requests).toEqual([
      { subject: "service", clientId: "service", scopes: ["data:read"], audience: [API], grantId: expect.any(String) },
    ]);
  });

  it.each([
    ["an array", ["roles"]],
    ["null", null],
    ["a string", "roles"],
    ["undefined", undefined],
  ])("makes handle reject with a TypeError for a result that is %s", async (_, result) => {
    const { op } = await setup(() => result as never);

    await expect(op.handle(await codeRequest(op, API))).rejects.toThrow(TypeError);
  });

  it("lets a throw propagate from the code exchange", async () => {
    const { op } = await setup(() => {
      throw new Error("directory down");
    });

    await expect(op.handle(await codeRequest(op, API))).rejects.toThrow("directory down");
  });
});

describe("accessTokenClaims at creation", () => {
  const base = async (): Promise<Omit<ProviderOptions, "accessToken" | "accessTokenClaims">> => ({
    issuer: ISSUER,
    signingKeys: [await generateKeyPair({ alg: "ES256", kid: "k1" })],
    store: createMemoryStore(),
    claims: () => ({}),
  });

  it.each([
    ["the default opaque format", undefined],
    ["an explicit opaque format", { format: "opaque" } as const],
  ])("is a TypeError with %s", async (_, accessToken) => {
    const options = await base();

    expect(() =>
      createProvider({
        ...options,
        ...(accessToken === undefined ? {} : { accessToken }),
        accessTokenClaims: () => ({}),
      }),
    ).toThrow(
      new TypeError(
        'createProvider: accessTokenClaims requires accessToken.format "jwt", since an opaque token carries no claims',
      ),
    );
  });

  it("is a TypeError when it is not a function", async () => {
    const options = await base();

    expect(() =>
      createProvider({
        ...options,
        accessToken: { format: "jwt", audience: API },
        accessTokenClaims: { roles: [] } as never,
      }),
    ).toThrow(new TypeError("createProvider: accessTokenClaims must be a function"));
  });
});
