import { createVerifier, importKeySet } from "@codenhub/jwt";
import { describe, expect, it } from "vitest";

import { type Client, createClient, discover } from "../../src/client";
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

/** A relying party for {@link CLIENT}, created from the provider's discovery document and requiring `sid`. */
async function relyingPartyOf(setup: ProviderSetup): Promise<Client> {
  const fetchFromProvider: typeof fetch = async (input, init) =>
    (await setup.provider.handle(new Request(input, init))) ?? new Response(null, { status: 404 });
  const discovered = await discover(ISSUER, { fetch: fetchFromProvider });
  if (!discovered.ok) {
    throw new Error("discovery failed");
  }
  return createClient({
    metadata: discovered.value,
    clientId: CLIENT,
    redirectUri: REDIRECT_URI,
    auth: { method: "none" },
    fetch: fetchFromProvider,
    now: () => setup.now.ms,
    backchannelLogout: { sessionRequired: true },
  });
}

/** Signs the user in through the relying party during the app's session {@link SESSION_ID}. */
async function signInDuringSession(setup: ProviderSetup, client: Client) {
  const started = await client.authorize();
  const begun = await setup.provider.beginAuthorization(new Request(started.url));
  if (!begun.ok) {
    throw new Error("beginAuthorization failed");
  }
  const completed = await setup.provider.completeAuthorization(begun.value.id, {
    subject: "user-1",
    authTime: Math.floor(setup.now.ms / 1000),
    scopes: begun.value.scopes,
    amr: ["pwd"],
    sessionId: SESSION_ID,
  });
  if (!completed.ok) {
    throw new Error("completeAuthorization failed");
  }
  const signedIn = await client.callback(completed.value.headers.get("location") ?? "", started.pending);
  if (!signedIn.ok) {
    throw new Error("callback failed");
  }
  return signedIn.value;
}

/** The provider's logout request for {@link CLIENT}. Throws when the provider builds none. */
async function logoutRequest(setup: ProviderSetup, target: { readonly subject?: string; readonly sessionId?: string }) {
  const request = await setup.provider.backchannelLogout({ clientId: CLIENT, ...target });
  if (request === null) {
    throw new Error("the provider built no logout request");
  }
  return request;
}

describe("back-channel logout, from the provider's request to the client's receiver", () => {
  it("tells the relying party which session ended, as the sid of its ID token", async () => {
    const setup = await setUpWithLogoutClient();
    const client = await relyingPartyOf(setup);
    const { claims } = await signInDuringSession(setup, client);

    const received = await client.readBackchannelLogout(
      await logoutRequest(setup, { subject: claims.sub, sessionId: claims.sid }),
    );

    const issuedAt = Math.floor(setup.now.ms / 1000);
    expect(claims.sid).toBe(SESSION_ID);
    expect(received.ok && received.value).toEqual({
      subject: "user-1",
      sessionId: SESSION_ID,
      jti: expect.any(String),
      issuedAt,
      expiresAt: issuedAt + 120,
    });
  });

  it("gives each request a new jti, for the app to refuse a replay by", async () => {
    const setup = await setUpWithLogoutClient();
    const client = await relyingPartyOf(setup);

    const first = await client.readBackchannelLogout(await logoutRequest(setup, { sessionId: SESSION_ID }));
    const second = await client.readBackchannelLogout(await logoutRequest(setup, { sessionId: SESSION_ID }));

    expect(first.ok && second.ok).toBe(true);
    expect(first.ok && second.ok && first.value.jti !== second.value.jti).toBe(true);
  });

  it("refuses the request once its token expired beyond the client's clock tolerance", async () => {
    const setup = await setUpWithLogoutClient();
    const client = await relyingPartyOf(setup);
    const request = await logoutRequest(setup, { sessionId: SESSION_ID });
    setup.now.ms += (120 + 60) * 1000;

    const received = await client.readBackchannelLogout(request);

    expect(!received.ok && received.error.issues.map((issue) => issue.params?.jwtCode)).toEqual(["expired"]);
  });

  it("refuses the relying party's own ID token posted as a logout token", async () => {
    const setup = await setUpWithLogoutClient();
    const client = await relyingPartyOf(setup);
    const { tokens } = await signInDuringSession(setup, client);
    const forged = new Request(LOGOUT_URI, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ logout_token: tokens.idToken }),
    });

    const received = await client.readBackchannelLogout(forged);

    expect(!received.ok && received.error.issues.map((issue) => issue.params?.jwtCode)).toEqual([
      "wrong_type",
      "missing_claim",
      "missing_claim",
    ]);
  });
});
