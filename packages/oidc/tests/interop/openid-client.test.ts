import { createKeySet, generateKeyPair, importPublicKey } from "@codenhub/jwt";
import * as oc from "openid-client";
import { describe, expect, it } from "vitest";

import {
  createProvider,
  generateClientSecret,
  hashClientSecret,
  type ClientAuthentication,
  type Provider,
} from "../../src/provider";
import { createMemoryStore } from "../../src/testing";

/*
 * panva's openid-client (v6, Fetch-based) as the relying party, against this package's provider. Nothing
 * touches the network: openid-client's `customFetch` hands each request to `provider.handle`.
 */

const ISSUER = "https://op.example";
const REDIRECT_URI = "https://app.example/cb";
const SUBJECT = "user-1";
const SCOPE = "openid profile offline_access";

type Method = "client_secret_basic" | "client_secret_post" | "private_key_jwt" | "none";

interface Setup {
  readonly provider: Provider;
  readonly config: oc.Configuration;
}

/** Registers one client with the given method, and discovers the provider the way a real RP would. */
async function setUp(method: Method): Promise<Setup> {
  const secret = generateClientSecret();
  let auth: ClientAuthentication;
  let clientAuth: oc.ClientAuth;
  if (method === "private_key_jwt") {
    const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const imported = await importPublicKey(await crypto.subtle.exportKey("jwk", pair.publicKey), { alg: "ES256" });
    if (!imported.ok) {
      throw new Error("public key import failed");
    }
    auth = { method, keys: createKeySet([imported.value]) };
    clientAuth = oc.PrivateKeyJwt(pair.privateKey);
  } else if (method === "none") {
    auth = { method };
    clientAuth = oc.None();
  } else {
    auth = { method, secretHash: await hashClientSecret(secret) };
    clientAuth = method === "client_secret_basic" ? oc.ClientSecretBasic(secret) : oc.ClientSecretPost(secret);
  }

  const provider = createProvider({
    issuer: ISSUER,
    signingKeys: [await generateKeyPair({ alg: "ES256", kid: "op-1" })],
    store: createMemoryStore({
      clients: [{ clientId: "rp", redirectUris: [REDIRECT_URI], scopes: SCOPE.split(" "), auth }],
    }),
    claims: ({ subject }) => ({ name: `User ${subject}` }),
  });

  const customFetch: oc.CustomFetch = async (url, options) => {
    const response = await provider.handle(
      new Request(url, {
        method: options.method,
        headers: options.headers,
        body: options.body as BodyInit | null | undefined,
      }),
    );
    return response ?? new Response(null, { status: 404 });
  };
  const config = await oc.discovery(new URL(ISSUER), "rp", undefined, clientAuth, { [oc.customFetch]: customFetch });
  return { provider, config };
}

/** The browser part: authorization request to the provider, sign-in as `user-1`, and the redirect back. */
async function signIn(setup: Setup, params: Record<string, string>): Promise<URL> {
  const url = oc.buildAuthorizationUrl(setup.config, params);
  const begun = await setup.provider.beginAuthorization(new Request(url));
  if (!begun.ok) {
    throw new Error(`beginAuthorization failed: ${JSON.stringify(begun.error.issues)}`);
  }
  const completed = await setup.provider.completeAuthorization(begun.value.id, {
    subject: SUBJECT,
    authTime: Math.floor(Date.now() / 1000),
    scopes: begun.value.scopes,
  });
  if (!completed.ok) {
    throw new Error(`completeAuthorization failed: ${JSON.stringify(completed.error.issues)}`);
  }
  expect(completed.value.status).toBe(302);
  return new URL(completed.value.headers.get("location") ?? "");
}

async function authorizationRequest(setup: Setup): Promise<{
  readonly callback: URL;
  readonly checks: oc.AuthorizationCodeGrantChecks;
}> {
  const pkceCodeVerifier = oc.randomPKCECodeVerifier();
  const expectedState = oc.randomState();
  const expectedNonce = oc.randomNonce();
  const callback = await signIn(setup, {
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    state: expectedState,
    nonce: expectedNonce,
    code_challenge: await oc.calculatePKCECodeChallenge(pkceCodeVerifier),
    code_challenge_method: "S256",
  });
  return { callback, checks: { pkceCodeVerifier, expectedState, expectedNonce } };
}

describe("openid-client against this provider", () => {
  it("keeps the issuer on https, so openid-client never needs allowInsecureRequests", () => {
    // Everything is https, so openid-client must never need `allowInsecureRequests`.
    expect(ISSUER.startsWith("https://")).toBe(true);
  });

  it.each<Method>(["client_secret_basic", "client_secret_post", "private_key_jwt", "none"])(
    "signs in, refreshes and reads userinfo with %s",
    async (method) => {
      const setup = await setUp(method);
      const { callback, checks } = await authorizationRequest(setup);

      // RFC 9207: the provider names itself in the response, and openid-client checks it.
      expect(callback.searchParams.get("iss")).toBe(ISSUER);
      const tokens = await oc.authorizationCodeGrant(setup.config, callback, checks);

      const claims = tokens.claims();
      expect(claims).toMatchObject({ sub: SUBJECT, iss: ISSUER, aud: "rp", nonce: checks.expectedNonce });
      expect(tokens.refresh_token).toBeTypeOf("string");

      const refreshed = await oc.refreshTokenGrant(setup.config, tokens.refresh_token as string);
      expect(refreshed.access_token).not.toBe(tokens.access_token);

      const userinfo = await oc.fetchUserInfo(setup.config, refreshed.access_token, SUBJECT);
      expect(userinfo).toMatchObject({ sub: SUBJECT, name: `User ${SUBJECT}` });
    },
  );

  it("rejects a replayed code, and openid-client surfaces the error", async () => {
    const setup = await setUp("client_secret_basic");
    const { callback, checks } = await authorizationRequest(setup);
    await oc.authorizationCodeGrant(setup.config, callback, checks);

    await expect(oc.authorizationCodeGrant(setup.config, callback, checks)).rejects.toMatchObject({
      error: "invalid_grant",
    });
  });
});
