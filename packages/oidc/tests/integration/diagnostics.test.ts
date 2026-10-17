import { beforeEach, describe, expect, it } from "vitest";

import { createProvider, type ProviderDiagnostic } from "../../src/provider";
import {
  answer,
  CONFIDENTIAL_CLIENT,
  codeForm,
  ISSUER,
  issueCode,
  issueTokens,
  PUBLIC_CLIENT,
  type ProviderSetup,
  redeem,
  REDIRECT_URI,
  refreshForm,
  setUpProvider,
  tokenRequest,
  USERINFO_URL,
  userinfoRequest,
} from "./provider-support";

describe("onDiagnostic", () => {
  let setup: ProviderSetup;
  let seen: ProviderDiagnostic[];

  beforeEach(async () => {
    seen = [];
    setup = await setUpProvider({
      onDiagnostic: (diagnostic) => {
        seen.push(diagnostic);
      },
    });
  });

  it("reports nothing for a request that succeeds", async () => {
    const issued = await issueTokens(setup);
    await answer(setup.provider, userinfoRequest(issued.tokens.access_token));

    expect(seen).toEqual([]);
  });

  it("reports why the token endpoint refused, with the status the client got", async () => {
    await answer(setup.provider, tokenRequest("grant_type=authorization_code", { contentType: "text/plain" }));
    await redeem(setup, { grant_type: "authorization_code", client_id: "nobody" });
    await redeem(setup, { grant_type: "authorization_code", client_id: CONFIDENTIAL_CLIENT });
    await redeem(setup, { grant_type: "authorization_code" }, { clientId: CONFIDENTIAL_CLIENT, secret: "wrong" });

    expect(seen).toEqual([
      { endpoint: "token", reason: "content_type", status: 400 },
      { endpoint: "token", reason: "client_unknown", status: 401 },
      { endpoint: "token", reason: "client_method_mismatch", status: 401, clientId: CONFIDENTIAL_CLIENT },
      { endpoint: "token", reason: "client_credentials_wrong", status: 401, clientId: CONFIDENTIAL_CLIENT },
    ]);
  });

  it("tells apart the reasons a code is refused, which the client sees as one invalid_grant", async () => {
    const wrongVerifier = await issueCode(setup);
    await redeem(setup, codeForm(wrongVerifier, PUBLIC_CLIENT, { code_verifier: "w".repeat(43) }));
    const wrongRedirect = await issueCode(setup);
    await redeem(setup, codeForm(wrongRedirect, PUBLIC_CLIENT, { redirect_uri: `${REDIRECT_URI}/other` }));
    const replayed = await issueCode(setup);
    await redeem(setup, codeForm(replayed, PUBLIC_CLIENT));
    await redeem(setup, codeForm(replayed, PUBLIC_CLIENT));
    await redeem(setup, codeForm({ ...replayed, code: "never-issued" }, PUBLIC_CLIENT));

    expect(seen.map(({ reason }) => reason)).toEqual([
      "code_verifier_mismatch",
      "redirect_uri_mismatch",
      "code_replayed",
      "code_unknown",
    ]);
    expect(seen.every((diagnostic) => diagnostic.clientId === PUBLIC_CLIENT && diagnostic.status === 400)).toBe(true);
  });

  it("reports a refresh token replay", async () => {
    const issued = await issueTokens(setup);
    const refreshToken = issued.tokens.refresh_token ?? "";
    await redeem(setup, refreshForm(refreshToken, PUBLIC_CLIENT));
    await redeem(setup, refreshForm(refreshToken, PUBLIC_CLIENT));

    expect(seen).toEqual([
      { endpoint: "token", reason: "refresh_token_replayed", status: 400, clientId: PUBLIC_CLIENT },
    ]);
  });

  it("reports userinfo and revocation refusals", async () => {
    await answer(setup.provider, new Request(USERINFO_URL));
    await answer(setup.provider, userinfoRequest("unknown-token"));
    await answer(
      setup.provider,
      new Request(`${ISSUER}/revoke`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `client_id=${PUBLIC_CLIENT}`,
      }),
    );

    expect(seen).toEqual([
      { endpoint: "userinfo", reason: "access_token_missing", status: 401 },
      { endpoint: "userinfo", reason: "access_token_unknown", status: 401 },
      { endpoint: "revocation", reason: "token_missing", status: 400, clientId: PUBLIC_CLIENT },
    ]);
  });

  it("is frozen and holds no value the request carried", async () => {
    const issued = await issueTokens(setup);
    await redeem(setup, codeForm(issued.code, PUBLIC_CLIENT));
    await redeem(
      setup,
      { grant_type: "authorization_code" },
      { clientId: CONFIDENTIAL_CLIENT, secret: "s3cret-value" },
    );

    const text = JSON.stringify(seen);
    expect(seen.length).toBe(2);
    expect(seen.every((diagnostic) => Object.isFrozen(diagnostic))).toBe(true);
    for (const value of [issued.code.code, issued.code.verifier, issued.tokens.access_token, "s3cret-value"]) {
      expect(text).not.toContain(value);
    }
  });

  it("makes handle reject with the error of an async callback that rejects", async () => {
    const failing = await setUpProvider({
      onDiagnostic: async () => {
        throw new Error("async logger down");
      },
    });

    await expect(failing.provider.handle(userinfoRequest("unknown-token"))).rejects.toThrow("async logger down");
  });

  it("makes handle reject when it throws, and is refused at creation when it is not a function", async () => {
    const failing = await setUpProvider({
      onDiagnostic: () => {
        throw new Error("logger down");
      },
    });

    await expect(failing.provider.handle(userinfoRequest("unknown-token"))).rejects.toThrow("logger down");
    expect(() =>
      createProvider({
        issuer: ISSUER,
        signingKeys: [setup.signingKey],
        store: setup.store,
        claims: () => ({}),
        onDiagnostic: "log" as unknown as () => void,
      }),
    ).toThrow(TypeError);
  });
});
