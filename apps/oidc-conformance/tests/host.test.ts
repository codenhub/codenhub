import { beforeAll, describe, expect, it } from "vitest";

import { CLIENT_IDS } from "../src/clients";
import { createHost, type Host } from "../src/host";
import {
  ALIAS,
  authorizationUrl,
  CALLBACK,
  codeFlow,
  decodeHeader,
  decodePayload,
  get,
  ISSUER,
  redirectParams,
  SECRETS,
  sessionCookie,
  SUITE_ORIGIN,
  tokenRequest,
} from "./support";

let host: Host;
const send = (request: Request): Promise<Response> => host.fetch(request);

beforeAll(async () => {
  host = await createHost({ issuer: ISSUER, suiteOrigin: SUITE_ORIGIN, alias: ALIAS, secrets: SECRETS });
});

describe("discovery", () => {
  it("lists RS256 for ID tokens, which the Config OP plan requires", async () => {
    const response = await get(send, `${ISSUER}/.well-known/openid-configuration`);
    const metadata = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(metadata["issuer"]).toBe(ISSUER);
    expect(metadata["id_token_signing_alg_values_supported"]).toContain("RS256");
    expect(metadata["authorization_endpoint"]).toBe(`${ISSUER}/authorize`);
    expect(metadata["end_session_endpoint"]).toBe(`${ISSUER}/logout`);
  });

  it("publishes an RS256 key at the JWKS endpoint", async () => {
    const jwks = (await (await get(send, `${ISSUER}/jwks`)).json()) as { keys: { kty: string; alg?: string }[] };

    expect(jwks.keys.map((key) => key.kty)).toEqual(["RSA"]);
  });
});

describe("the authorization code flow without PKCE", () => {
  it("signs the test user in with a nonce and releases the scopes' claims at userinfo", async () => {
    const { tokens, userinfo, cookie } = await codeFlow(send);

    expect(cookie).toMatch(/^conformance_session=.+/);
    expect(decodeHeader(tokens.id_token)["alg"]).toBe("RS256");
    expect(decodePayload(tokens.id_token)).toMatchObject({
      iss: ISSUER,
      sub: "conformance-user",
      aud: CLIENT_IDS.first,
      nonce: "nonce-1",
    });
    expect(typeof decodePayload(tokens.id_token)["auth_time"]).toBe("number");
    expect(userinfo).toMatchObject({
      sub: "conformance-user",
      name: "Conformance Test User",
      email: "conformance-user@example.com",
      phone_number: "+46 8 123 456",
      address: { country: "SE" },
    });
  });

  it("refreshes a token issued for offline_access", async () => {
    const { tokens } = await codeFlow(send);

    const refreshed = await send(
      tokenRequest(CLIENT_IDS.first, SECRETS.first, {
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token ?? "",
      }),
    );

    expect(refreshed.status).toBe(200);
  });

  it("accepts the authorization request as a form POST, and with prompt=consent", async () => {
    const url = new URL(authorizationUrl({ prompt: "consent" }));
    const response = await send(
      new Request(`${url.origin}${url.pathname}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: url.searchParams,
        redirect: "manual",
      }),
    );

    expect(redirectParams(response).get("code")).not.toBeNull();
  });

  it("refuses the same request without a nonce, the known failure of the Basic OP plan", async () => {
    const params = redirectParams(await get(send, authorizationUrl({ nonce: null })));

    expect(params.get("error")).toBe("invalid_request");
    expect(params.get("state")).toBe("state-1");
  });

  it("does not read the userinfo access token from the request body", async () => {
    const { tokens } = await codeFlow(send);

    const response = await send(
      new Request(`${ISSUER}/userinfo`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ access_token: tokens.access_token }),
      }),
    );

    expect(response.status).toBe(401);
  });
});

describe("the control client", () => {
  it("refuses an authorization request without PKCE, even with a nonce", async () => {
    const response = await get(
      send,
      authorizationUrl({
        client_id: CLIENT_IDS.control,
        redirect_uri: `${SUITE_ORIGIN}/test/a/${ALIAS}-control/callback`,
      }),
    );

    expect(redirectParams(response).get("error")).toBe("invalid_request");
  });

  it("is proven by the self-check endpoint", async () => {
    const response = await get(send, `${ISSUER}/self-check`);

    expect(await response.json()).toEqual({ ok: true, controlClient: CLIENT_IDS.control, requiresPkce: true });
  });
});

describe("sessions", () => {
  it("answers login_required to prompt=none when the browser has no session", async () => {
    const params = redirectParams(await get(send, authorizationUrl({ prompt: "none" })));

    expect(params.get("error")).toBe("login_required");
    expect(params.get("state")).toBe("state-1");
  });

  it("answers prompt=none with a code when the browser has a session", async () => {
    const { cookie } = await codeFlow(send);

    const params = redirectParams(await get(send, authorizationUrl({ prompt: "none" }), cookie));

    expect(params.get("code")).not.toBeNull();
  });

  it("signs in again for prompt=login, with a new session cookie", async () => {
    const { cookie } = await codeFlow(send);

    const again = await get(send, authorizationUrl({ prompt: "login" }), cookie);

    expect(redirectParams(again).get("code")).not.toBeNull();
    expect(sessionCookie(again)).toBeDefined();
    expect(sessionCookie(again)).not.toBe(cookie);
  });

  it("signs in again when the session is older than max_age, and not when it is younger", async () => {
    let time = Date.parse("2026-11-13T10:00:00Z");
    const timed = await createHost({
      issuer: ISSUER,
      suiteOrigin: SUITE_ORIGIN,
      alias: ALIAS,
      secrets: SECRETS,
      now: () => time,
    });
    const sendTimed = (request: Request): Promise<Response> => timed.fetch(request);
    const { cookie } = await codeFlow(sendTimed);
    time += 5000;

    const young = await get(sendTimed, authorizationUrl({ max_age: "10000" }), cookie);
    const old = await get(sendTimed, authorizationUrl({ max_age: "1" }), cookie);

    expect(sessionCookie(young)).toBeUndefined();
    expect(sessionCookie(old)).toBeDefined();
    expect(redirectParams(old).get("code")).not.toBeNull();
  });

  it("ends the session at the end-session endpoint", async () => {
    const { cookie } = await codeFlow(send);

    const out = await get(send, `${ISSUER}/logout?client_id=${CLIENT_IDS.first}`, cookie);

    expect(out.status).toBe(200);
    expect(out.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(redirectParams(await get(send, authorizationUrl({ prompt: "none" }), cookie)).get("error")).toBe(
      "login_required",
    );
  });
});

describe("client registration", () => {
  it("renders an error page, not a redirect, for an unregistered redirect URI", async () => {
    const response = await get(send, authorizationUrl({ redirect_uri: `${CALLBACK}/other` }));

    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).toContain("invalid_redirect_uri");
  });

  it("authenticates the post client with client_secret_post, and the others with client_secret_basic only", async () => {
    const params = redirectParams(await get(send, authorizationUrl({ client_id: CLIENT_IDS.post })));
    const form = { grant_type: "authorization_code", code: params.get("code") ?? "", redirect_uri: CALLBACK };

    const post = await send(tokenRequest(CLIENT_IDS.post, SECRETS.post, form, "post"));
    const basicClientByPost = await send(tokenRequest(CLIENT_IDS.first, SECRETS.first, form, "post"));

    expect(post.status).toBe(200);
    expect(basicClientByPost.status).toBe(401);
  });
});

describe("the host's own checks", () => {
  it("fails loudly for a request to another origin than the issuer", async () => {
    const response = await get(send, "https://elsewhere.test/.well-known/openid-configuration");

    expect(response.status).toBe(500);
    expect(await response.text()).toContain("Set ISSUER");
  });
});
