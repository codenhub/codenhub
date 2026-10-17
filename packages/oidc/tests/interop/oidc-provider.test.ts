import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createClient, discover, type Client } from "../../src/client";
import {
  ACCOUNT_ID,
  CLIENT_ID,
  CLIENT_SECRET,
  ISSUER,
  REDIRECT_URI,
  SCOPE,
  startProvider,
  type RunningProvider,
} from "./oidc-provider-support";

/* This package's client against panva's oidc-provider as the OpenID Provider. */

describe("this client against oidc-provider", () => {
  let op: RunningProvider;
  let client: Client;

  beforeAll(async () => {
    op = await startProvider();
    const discovered = await discover(ISSUER, { fetch: op.fetch });
    if (!discovered.ok) {
      throw new Error(`discovery failed: ${JSON.stringify(discovered.error.issues)}`);
    }
    client = createClient({
      metadata: discovered.value,
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      auth: { method: "client_secret_basic", secret: CLIENT_SECRET },
      fetch: op.fetch,
    });
  });

  afterAll(async () => {
    // beforeAll may have thrown before `op` was set; the original failure must still be the one reported.
    await op?.close();
  });

  it("forwards the request's abort signal to the provider", async () => {
    await expect(
      op.fetch(`${ISSUER}/.well-known/openid-configuration`, { signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("does not follow a redirect to a look-alike of the callback URI", async () => {
    await expect(op.browse(`${ISSUER}/lookalike-callback`)).rejects.toThrow("the browser stopped at 404");
  });

  it("signs in, refreshes and reads userinfo", async () => {
    // oidc-provider issues a refresh token for offline_access only when the request asks for consent.
    const { url, pending } = await client.authorize({ scope: SCOPE, prompt: ["consent"] });
    const callback = await op.browse(url);

    const signedIn = await client.callback(callback, pending);
    if (!signedIn.ok) {
      throw new Error(`callback failed: ${JSON.stringify(signedIn.error.issues)}`);
    }
    const { claims, tokens } = signedIn.value;
    expect(claims).toMatchObject({ sub: ACCOUNT_ID, iss: ISSUER, aud: CLIENT_ID, nonce: pending.nonce });
    expect(tokens.refreshToken).toBeTypeOf("string");

    const refreshed = await client.refresh({ refreshToken: tokens.refreshToken as string, subject: claims.sub });
    if (!refreshed.ok) {
      throw new Error(`refresh failed: ${JSON.stringify(refreshed.error.issues)}`);
    }
    expect(refreshed.value.tokens.accessToken).not.toBe(tokens.accessToken);

    const userinfo = await client.userinfo({ accessToken: refreshed.value.tokens.accessToken, subject: claims.sub });
    expect(userinfo).toMatchObject({ ok: true, value: { sub: ACCOUNT_ID, name: "Ada Lovelace" } });
  });
});
