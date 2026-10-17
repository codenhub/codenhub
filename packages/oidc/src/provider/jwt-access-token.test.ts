import { type KeyPair, createKeySet, createVerifier, generateKeyPair } from "@codenhub/jwt";
import { describe, expect, it } from "vitest";

import { digestKey, randomToken } from "../shared/encoding";
import { computeCodeChallenge } from "../shared/pkce";
import { computeTokenHash } from "../shared/token-hash";
import { type MemoryStore, createMemoryStore } from "../testing/memory-store";
import { createProvider } from "./create-provider";
import { generateClientSecret, hashClientSecret } from "./secrets";
import type { AccessTokenFormat, Provider } from "./types";

const ISSUER = "https://op.example";
const AUDIENCE = "https://api.example";
const REDIRECT_URI = "https://app.example/cb";
const VERIFIER = "v".repeat(43);
const NOW_MS = 1_800_000_000_000;
const NOW_SECONDS = NOW_MS / 1000;

interface Setup {
  readonly op: Provider;
  readonly store: MemoryStore;
  readonly pair: KeyPair;
  readonly secret: string;
}

async function setup(accessToken: AccessTokenFormat = { format: "jwt", audience: AUDIENCE }): Promise<Setup> {
  const secret = generateClientSecret();
  const pair = await generateKeyPair({ alg: "ES256", kid: "k1" });
  const store = createMemoryStore({
    clients: [
      {
        clientId: "web",
        redirectUris: [REDIRECT_URI],
        scopes: ["openid", "profile", "offline_access"],
        auth: { method: "none" },
      },
      {
        clientId: "service",
        redirectUris: [],
        scopes: ["orders:read"],
        auth: { method: "client_secret_post", secretHash: await hashClientSecret(secret) },
        grantTypes: ["client_credentials"],
      },
    ],
  });
  const op = createProvider({
    issuer: ISSUER,
    signingKeys: [pair],
    store,
    claims: () => ({ name: "Ada" }),
    scopes: { "orders:read": [] },
    accessToken,
    now: () => NOW_MS,
  });
  return { op, store, pair, secret };
}

/** A resource server's check of an RFC 9068 token, with `@codenhub/jwt` alone, as the docs show it. */
const resourceServer = (pair: KeyPair, audience = AUDIENCE) =>
  createVerifier({
    keys: createKeySet([pair.publicKey]),
    issuer: ISSUER,
    audience,
    type: "at+jwt",
    requiredClaims: ["sub", "client_id", "iat", "jti"],
    now: () => NOW_MS,
  });

const post = (path: string, body: Record<string, string>): Request =>
  new Request(`${ISSUER}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });

async function json(op: Provider, request: Request): Promise<Record<string, unknown>> {
  const response = await op.handle(request);
  expect(response?.status).toBe(200);
  return (await response?.json()) as Record<string, unknown>;
}

/** Saves a code for user-1 as the authorization step would, and redeems it. */
async function signIn({ op, store }: Setup): Promise<Record<string, unknown>> {
  const code = randomToken();
  await store.saveCode(await digestKey(code), {
    grantId: "grant-1",
    clientId: "web",
    redirectUri: REDIRECT_URI,
    codeChallenge: await computeCodeChallenge(VERIFIER),
    scopes: ["openid", "profile", "offline_access"],
    subject: "user-1",
    authTime: NOW_SECONDS - 30,
    amr: ["pwd"],
    acr: "urn:loa:1",
    maxAgeRequested: false,
    expiresAt: NOW_SECONDS + 60,
  });
  return json(
    op,
    post("/token", {
      grant_type: "authorization_code",
      client_id: "web",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: VERIFIER,
    }),
  );
}

describe("JWT access tokens", () => {
  it("issues an at+jwt a resource server verifies offline, with the RFC 9068 claims", async () => {
    const context = await setup();
    const body = await signIn(context);

    const verified = await resourceServer(context.pair)(body.access_token as string);

    expect(verified.ok && verified.value.header).toMatchObject({ typ: "at+jwt", alg: "ES256", kid: "k1" });
    const payload = verified.ok ? verified.value.payload : {};
    expect(payload).toEqual({
      iss: ISSUER,
      exp: NOW_SECONDS + 600,
      aud: AUDIENCE,
      sub: "user-1",
      client_id: "web",
      iat: NOW_SECONDS,
      jti: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      scope: "openid profile offline_access",
      auth_time: NOW_SECONDS - 30,
      amr: ["pwd"],
      acr: "urn:loa:1",
    });
  });

  it("binds the ID token's at_hash to the JWT", async () => {
    const body = await signIn(await setup());
    const idPayload = JSON.parse(
      Buffer.from((body.id_token as string).split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as Record<string, unknown>;

    expect(idPayload.at_hash).toBe(await computeTokenHash(body.access_token as string, "ES256"));
  });

  it("is not an ID token: the ID token fails a resource server's at+jwt check", async () => {
    const context = await setup();
    const body = await signIn(context);

    // The ID token's audience is the client, so the audience check passes and the `typ` check must report it.
    const verified = await resourceServer(context.pair, "web")(body.id_token as string);

    expect(verified.ok).toBe(false);
    expect(!verified.ok && verified.error.issues).toContainEqual({ code: "wrong_type", path: ["header", "typ"] });
  });

  it("works at userinfo and revocation like an opaque token", async () => {
    const context = await setup();
    const body = await signIn(context);
    const accessToken = body.access_token as string;

    const claims = await json(
      context.op,
      new Request(`${ISSUER}/userinfo`, { headers: { authorization: `Bearer ${accessToken}` } }),
    );
    expect(claims).toEqual({ name: "Ada", sub: "user-1" });

    const revoked = await context.op.handle(post("/revoke", { client_id: "web", token: accessToken }));
    expect(revoked?.status).toBe(200);
    expect(await context.store.findAccessToken(await digestKey(accessToken))).toBeUndefined();
  });

  it("issues refreshed access tokens as JWTs with the original auth_time", async () => {
    const context = await setup();
    const body = await signIn(context);

    const refreshed = await json(
      context.op,
      post("/token", { grant_type: "refresh_token", client_id: "web", refresh_token: body.refresh_token as string }),
    );
    const verified = await resourceServer(context.pair)(refreshed.access_token as string);

    expect(verified.ok && verified.value.payload).toMatchObject({ sub: "user-1", auth_time: NOW_SECONDS - 30 });
  });

  it("gives a client_credentials token the client as subject and no authentication context", async () => {
    const context = await setup();

    const body = await json(
      context.op,
      post("/token", { grant_type: "client_credentials", client_id: "service", client_secret: context.secret }),
    );
    const verified = await resourceServer(context.pair)(body.access_token as string);

    const payload = verified.ok ? verified.value.payload : {};
    expect(payload).toMatchObject({ sub: "service", client_id: "service", scope: "orders:read" });
    expect(Object.keys(payload)).not.toContain("auth_time");
    expect(Object.keys(payload)).not.toContain("amr");
  });

  it("stays opaque by default", async () => {
    const body = await signIn(await setup({ format: "opaque" }));

    expect(body.access_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe("the accessToken option", () => {
  const attempt = async (accessToken: unknown): Promise<void> => {
    createProvider({
      issuer: ISSUER,
      signingKeys: [await generateKeyPair({ alg: "ES256", kid: "k1" })],
      store: createMemoryStore(),
      claims: () => ({}),
      accessToken: accessToken as AccessTokenFormat,
    });
  };

  it.each([
    ["an unknown format", { format: "paseto" }, "accessToken.format"],
    ["a null", null, "accessToken.format"],
    ["a JWT format without audience", { format: "jwt" }, "accessToken.audience"],
    ["an empty audience", { format: "jwt", audience: "" }, "accessToken.audience"],
    ["a lone surrogate in the audience", { format: "jwt", audience: "\uD800" }, "accessToken.audience"],
  ])("throws a TypeError for %s", async (_name, accessToken, member) => {
    await expect(attempt(accessToken)).rejects.toThrow(member);
  });
});
