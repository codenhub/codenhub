import { beforeEach, describe, expect, it } from "vitest";

import {
  answer,
  type Basic,
  basicHeader,
  CONFIDENTIAL_CLIENT,
  DISCOVERY_URL,
  ISSUER,
  type Issued,
  issueTokens,
  PUBLIC_CLIENT,
  type ProviderSetup,
  redeem,
  refreshForm,
  setUpProvider,
  userinfoRequest,
} from "./provider-support";

const REVOCATION_URL = `${ISSUER}/revoke`;

/** A POST to the revocation endpoint (RFC 7009 §2.1). */
function revocationRequest(form: Readonly<Record<string, string>>, basic?: Basic): Request {
  const headers = new Headers({ "content-type": "application/x-www-form-urlencoded" });
  if (basic !== undefined) {
    headers.set("authorization", basicHeader(basic));
  }
  return new Request(REVOCATION_URL, { method: "POST", headers, body: new URLSearchParams(form).toString() });
}

describe("token revocation (RFC 7009)", () => {
  let setup: ProviderSetup;
  let issued: Issued;

  const revoke = (token: string, clientId = PUBLIC_CLIENT): Promise<Response> =>
    answer(setup.provider, revocationRequest({ token, client_id: clientId }));
  const userinfoStatus = async (accessToken: string): Promise<number> =>
    (await answer(setup.provider, userinfoRequest(accessToken))).status;
  const refreshStatus = async (refreshToken: string): Promise<number> =>
    (await redeem(setup, refreshForm(refreshToken, PUBLIC_CLIENT))).status;

  beforeEach(async () => {
    setup = await setUpProvider();
    issued = await issueTokens(setup);
  });

  it("revokes the grant when the client revokes its access token", async () => {
    const response = await revoke(issued.tokens.access_token);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(await userinfoStatus(issued.tokens.access_token)).toBe(401);
    expect(await refreshStatus(issued.tokens.refresh_token ?? "")).toBe(400);
  });

  it("revokes the grant when the client revokes its refresh token", async () => {
    const response = await revoke(issued.tokens.refresh_token ?? "");

    expect(response.status).toBe(200);
    expect(await userinfoStatus(issued.tokens.access_token)).toBe(401);
    expect(await refreshStatus(issued.tokens.refresh_token ?? "")).toBe(400);
  });

  it("answers 200 for an unknown token, a token revoked twice, and an ID token, revoking nothing", async () => {
    expect((await revoke("not-a-token")).status).toBe(200);
    expect((await revoke(issued.tokens.id_token)).status).toBe(200);
    expect(await userinfoStatus(issued.tokens.access_token)).toBe(200);

    expect((await revoke(issued.tokens.access_token)).status).toBe(200);
    expect((await revoke(issued.tokens.access_token)).status).toBe(200);
  });

  it("refuses another client's access token and leaves it working", async () => {
    const response = await answer(
      setup.provider,
      revocationRequest({ token: issued.tokens.access_token }, { clientId: CONFIDENTIAL_CLIENT, secret: setup.secret }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    expect(await userinfoStatus(issued.tokens.access_token)).toBe(200);
  });

  it("refuses another client's refresh token and revokes its grant, since the lookup spent it", async () => {
    const response = await answer(
      setup.provider,
      revocationRequest(
        { token: issued.tokens.refresh_token ?? "" },
        { clientId: CONFIDENTIAL_CLIENT, secret: setup.secret },
      ),
    );

    expect(response.status).toBe(400);
    expect(await userinfoStatus(issued.tokens.access_token)).toBe(401);
  });

  it("revokes the grant when a spent refresh token is presented", async () => {
    const rotated = await redeem(setup, refreshForm(issued.tokens.refresh_token ?? "", PUBLIC_CLIENT));
    const next = (await rotated.json()) as { access_token: string };

    expect((await revoke(issued.tokens.refresh_token ?? "")).status).toBe(200);
    expect(await userinfoStatus(next.access_token)).toBe(401);
  });

  it("refuses a request without a token, or from a client that fails authentication", async () => {
    const missing = await answer(setup.provider, revocationRequest({ client_id: PUBLIC_CLIENT }));
    const badSecret = await answer(
      setup.provider,
      revocationRequest({ token: issued.tokens.access_token }, { clientId: CONFIDENTIAL_CLIENT, secret: "wrong" }),
    );

    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: "invalid_request" });
    expect(badSecret.status).toBe(401);
    expect(await userinfoStatus(issued.tokens.access_token)).toBe(200);
  });

  it("accepts POST only, and answers a preflight", async () => {
    const get = await answer(setup.provider, new Request(REVOCATION_URL));
    const preflight = await answer(setup.provider, new Request(REVOCATION_URL, { method: "OPTIONS" }));

    expect(get.status).toBe(405);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("is published in discovery with the token endpoint's authentication methods", async () => {
    const metadata = (await (await answer(setup.provider, new Request(DISCOVERY_URL))).json()) as Record<
      string,
      unknown
    >;

    expect(metadata.revocation_endpoint).toBe(REVOCATION_URL);
    expect(metadata.revocation_endpoint_auth_methods_supported).toEqual(metadata.token_endpoint_auth_methods_supported);
  });
});
