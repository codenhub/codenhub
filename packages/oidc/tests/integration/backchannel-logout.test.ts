import { createVerifier, importKeySet } from "@codenhub/jwt";
import { describe, expect, it } from "vitest";

import type { MemoryStore } from "../../src/testing";
import {
  codeForm,
  DISCOVERY_URL,
  issueCode,
  ISSUER,
  type ProviderSetup,
  redeem,
  REDIRECT_URI,
  setUpProvider,
  type TokenBody,
} from "./provider-support";

const CLIENT = "relying-party";
const LOGOUT_URI = "https://rp.example/backchannel-logout";
const SESSION_ID = "sess-8f3a91c2";

/** A provider with a public client that has registered a back-channel logout URI. */
async function setUpWithLogoutClient(): Promise<ProviderSetup> {
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
    scopes: ["openid"],
    auth: { method: "none" },
    backchannelLogout: { uri: LOGOUT_URI, sessionRequired: true },
  });
  return setup;
}

/** The public keys the provider publishes at its JWKS endpoint, as the relying party would fetch them. */
async function verifierOf(setup: ProviderSetup, type: string) {
  const jwks: unknown = await (await setup.provider.handle(new Request(`${ISSUER}/jwks`)))?.json();
  const keys = await importKeySet(jwks);
  if (!keys.ok) {
    throw new Error("the provider published a JWKS that does not import");
  }
  return createVerifier({
    keys: keys.value,
    issuer: ISSUER,
    audience: CLIENT,
    type,
    now: () => setup.now.ms,
  });
}

describe("back-channel logout, from sign-in to logout request", () => {
  it("names in the logout token the session the ID token carried as sid", async () => {
    const setup = await setUpWithLogoutClient();
    const code = await issueCode(setup, {
      params: { client_id: CLIENT, scope: "openid" },
      grant: { sessionId: SESSION_ID },
    });
    const body = (await (await redeem(setup, codeForm(code, CLIENT))).json()) as TokenBody;

    const request = await setup.provider.backchannelLogout({
      clientId: CLIENT,
      subject: "user-1",
      sessionId: SESSION_ID,
    });

    const idToken = await (await verifierOf(setup, "JWT"))(body.id_token);
    const logoutToken = new URLSearchParams((await request?.text()) ?? "").get("logout_token") ?? "";
    const verified = await (await verifierOf(setup, "logout+jwt"))(logoutToken);
    expect(idToken.ok && idToken.value.payload.sid).toBe(SESSION_ID);
    expect(verified.ok).toBe(true);
    if (!verified.ok || !idToken.ok) {
      return;
    }
    expect(verified.value.payload.sid).toBe(idToken.value.payload.sid);
    expect(verified.value.payload.sub).toBe(idToken.value.payload.sub);
    expect(verified.value.payload).not.toHaveProperty("nonce");
    expect(request?.method).toBe("POST");
    expect(request?.url).toBe(LOGOUT_URI);
  });

  it("refuses to verify the logout token as an ID token, and the ID token as a logout token", async () => {
    const setup = await setUpWithLogoutClient();
    const code = await issueCode(setup, {
      params: { client_id: CLIENT, scope: "openid" },
      grant: { sessionId: SESSION_ID },
    });
    const body = (await (await redeem(setup, codeForm(code, CLIENT))).json()) as TokenBody;
    const request = await setup.provider.backchannelLogout({ clientId: CLIENT, sessionId: SESSION_ID });
    const logoutToken = new URLSearchParams((await request?.text()) ?? "").get("logout_token") ?? "";

    expect((await (await verifierOf(setup, "JWT"))(logoutToken)).ok).toBe(false);
    expect((await (await verifierOf(setup, "logout+jwt"))(body.id_token)).ok).toBe(false);
  });

  it("advertises back-channel logout in the discovery document", async () => {
    const setup = await setUpWithLogoutClient();

    const document = (await (await setup.provider.handle(new Request(DISCOVERY_URL)))?.json()) as Record<
      string,
      unknown
    >;

    expect(document).toMatchObject({ backchannel_logout_supported: true, backchannel_logout_session_supported: true });
  });
});
