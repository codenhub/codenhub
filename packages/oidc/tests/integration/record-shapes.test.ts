import { describe, expect, it } from "vitest";

import type { MemoryStore } from "../../src/testing";
import {
  answer,
  codeForm,
  issueCode,
  PUBLIC_CLIENT,
  type ProviderSetup,
  REDIRECT_URI,
  redeem,
  refreshForm,
  setUpProvider,
  type TokenBody,
  userinfoRequest,
} from "./provider-support";

/** Decodes a token's payload without verifying it; the provider's own tests cover the signature. */
const payloadOf = (token: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>;

describe("a session id on a grant", () => {
  it("reaches the ID token of the code exchange and of every refresh as sid", async () => {
    const setup = await setUpProvider();
    const issued = await issueCode(setup, {
      params: { scope: "openid profile offline_access" },
      grant: { sessionId: "session-42" },
    });

    const exchanged = (await (await redeem(setup, codeForm(issued, PUBLIC_CLIENT))).json()) as TokenBody;
    const refreshed = (await (
      await redeem(setup, refreshForm(exchanged.refresh_token ?? "", PUBLIC_CLIENT))
    ).json()) as TokenBody;

    expect(payloadOf(exchanged.id_token).sid).toBe("session-42");
    expect(payloadOf(refreshed.id_token).sid).toBe("session-42");
  });

  it("leaves sid out of the ID token when the grant has no session id", async () => {
    const setup = await setUpProvider();
    const issued = await issueCode(setup);

    const exchanged = (await (await redeem(setup, codeForm(issued, PUBLIC_CLIENT))).json()) as TokenBody;

    expect(payloadOf(exchanged.id_token)).not.toHaveProperty("sid");
  });
});

describe("token lifetimes per client", () => {
  const CLIENT = "short-lived";

  /** A provider whose extra client sets its own lifetimes, shorter than the provider's defaults. */
  async function setUpShortLived(): Promise<ProviderSetup> {
    let memory: MemoryStore | undefined;
    const setup = await setUpProvider({
      wrapStore: (store) => {
        memory = store;
        return store;
      },
    });
    memory?.addClient({
      clientId: CLIENT,
      redirectUris: [REDIRECT_URI],
      scopes: ["openid", "profile", "offline_access"],
      auth: { method: "none" },
      ttl: { code: 5, accessToken: 120, refreshToken: 3600 },
    });
    return setup;
  }

  const params = { client_id: CLIENT, scope: "openid profile offline_access" };

  it("ends the code, the access token and the refresh token family at the client's own lifetimes", async () => {
    const setup = await setUpShortLived();
    const stale = await issueCode(setup, { params });
    setup.now.ms += 6000;
    const refused = await redeem(setup, codeForm(stale, CLIENT));

    const issued = await issueCode(setup, { params });
    const response = await redeem(setup, codeForm(issued, CLIENT));
    const tokens = (await response.json()) as TokenBody;
    setup.now.ms += 121_000;
    const expired = await answer(setup.provider, userinfoRequest(tokens.access_token));
    setup.now.ms += 3600_000;
    const refreshed = await redeem(setup, refreshForm(tokens.refresh_token ?? "", CLIENT));

    expect(refused.status).toBe(400);
    expect(tokens.expires_in).toBe(120);
    expect(expired.status).toBe(401);
    expect(refreshed.status).toBe(400);
  });

  it("leaves another client on the provider's lifetimes", async () => {
    const setup = await setUpShortLived();
    const issued = await issueCode(setup);
    setup.now.ms += 6000;

    const response = await redeem(setup, codeForm(issued, PUBLIC_CLIENT));

    expect(response.status).toBe(200);
    expect(((await response.json()) as TokenBody).expires_in).toBe(600);
  });
});
