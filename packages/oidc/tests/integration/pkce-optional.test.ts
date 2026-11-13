import { beforeEach, describe, expect, it } from "vitest";

import { createProvider, type ProviderDiagnostic } from "../../src/provider";
import { createMemoryStore } from "../../src/testing";
import {
  answer,
  authorizationUrl,
  beginFailure,
  codeForm,
  ISSUER,
  issueCode,
  LEGACY_CLIENT,
  NONCE,
  PUBLIC_CLIENT,
  type ProviderSetup,
  redeem,
  REDIRECT_URI,
  setUpProvider,
  summarizeRedirect,
  userinfoRequest,
  VERIFIER,
  without,
  CONFIDENTIAL_CLIENT,
} from "./provider-support";

/** The parameters of a request from a client with `requirePkce: false` that sends no PKCE. */
const NO_PKCE = { client_id: LEGACY_CLIENT, code_challenge: null, code_challenge_method: null } as const;

const INVALID_GRANT = JSON.stringify({ error: "invalid_grant" });

describe("requirePkce: false", () => {
  let setup: ProviderSetup;
  let seen: ProviderDiagnostic[];
  const legacy = (): { clientId: string; secret: string } => ({ clientId: LEGACY_CLIENT, secret: setup.secret });

  beforeEach(async () => {
    seen = [];
    setup = await setUpProvider({ onDiagnostic: (diagnostic) => void seen.push(diagnostic) });
  });

  it("signs a confidential client in end to end with a nonce and no PKCE", async () => {
    const issued = await issueCode(setup, { params: NO_PKCE });
    const form = without(codeForm(issued, LEGACY_CLIENT), "code_verifier");

    const response = await redeem(setup, form, legacy());
    const tokens = (await response.json()) as { access_token: string; id_token: string };

    expect(response.status).toBe(200);
    const payload = JSON.parse(Buffer.from(tokens.id_token.split(".")[1] ?? "", "base64url").toString("utf8")) as {
      nonce?: string;
    };
    expect(payload.nonce).toBe(NONCE);
    expect((await answer(setup.provider, userinfoRequest(tokens.access_token))).status).toBe(200);
    expect(seen).toEqual([]);
  });

  it("refuses the same request without a nonce, by redirecting invalid_request", async () => {
    const failure = await beginFailure(setup.provider, authorizationUrl({ ...NO_PKCE, nonce: null }));

    expect(failure.issues).toEqual([{ code: "invalid_request", path: ["nonce"] }]);
    expect(summarizeRedirect(failure.redirect)).toMatchObject({
      status: 302,
      target: REDIRECT_URI,
      params: { error: "invalid_request", iss: ISSUER },
    });
  });

  it("refuses a challenge method with no challenge, as it refuses it from every client", async () => {
    const failure = await beginFailure(setup.provider, authorizationUrl({ ...NO_PKCE, code_challenge_method: "S256" }));

    expect(failure.issues).toEqual([{ code: "invalid_request", path: ["code_challenge"] }]);
  });

  it("still refuses plain PKCE when a challenge is sent", async () => {
    const failure = await beginFailure(
      setup.provider,
      authorizationUrl({ client_id: LEGACY_CLIENT, code_challenge_method: "plain" }),
    );

    expect(failure.issues).toEqual([{ code: "invalid_request", path: ["code_challenge_method"] }]);
  });

  it("still enforces a challenge it was sent: the verifier is required and checked", async () => {
    const wrong = await issueCode(setup, { params: { client_id: LEGACY_CLIENT } });
    const missing = await issueCode(setup, { params: { client_id: LEGACY_CLIENT } });
    const right = await issueCode(setup, { params: { client_id: LEGACY_CLIENT } });

    const responses = [
      await redeem(setup, codeForm(wrong, LEGACY_CLIENT, { code_verifier: "w".repeat(43) }), legacy()),
      await redeem(setup, without(codeForm(missing, LEGACY_CLIENT), "code_verifier"), legacy()),
      await redeem(setup, codeForm(right, LEGACY_CLIENT), legacy()),
    ];

    expect(await responses[0]?.text()).toBe(INVALID_GRANT);
    expect(await responses[1]?.text()).toBe(INVALID_GRANT);
    expect(responses[2]?.status).toBe(200);
    expect(seen.map(({ reason }) => reason)).toEqual(["code_verifier_mismatch", "code_verifier_missing"]);
  });

  it("refuses a PKCE downgrade: a verifier sent for a code issued without a challenge", async () => {
    const issued = await issueCode(setup, { params: NO_PKCE });

    const response = await redeem(setup, codeForm(issued, LEGACY_CLIENT, { code_verifier: VERIFIER }), legacy());

    expect(response.status).toBe(400);
    expect(await response.text()).toBe(INVALID_GRANT);
    expect(seen).toEqual([
      { endpoint: "token", reason: "code_verifier_unexpected", status: 400, clientId: LEGACY_CLIENT },
    ]);
  });

  it("burns the code of a downgrade attempt, so the honest redemption that follows is a replay", async () => {
    const issued = await issueCode(setup, { params: NO_PKCE });
    await redeem(setup, codeForm(issued, LEGACY_CLIENT), legacy());

    const response = await redeem(setup, without(codeForm(issued, LEGACY_CLIENT), "code_verifier"), legacy());

    expect(await response.text()).toBe(INVALID_GRANT);
    expect(seen.map(({ reason }) => reason)).toEqual(["code_verifier_unexpected", "code_replayed"]);
  });

  it("still refuses a client that kept the default when it sends no challenge", async () => {
    const failure = await beginFailure(
      setup.provider,
      authorizationUrl({ client_id: CONFIDENTIAL_CLIENT, code_challenge: null, code_challenge_method: null }),
    );
    const publicFailure = await beginFailure(
      setup.provider,
      authorizationUrl({ client_id: PUBLIC_CLIENT, code_challenge: null, code_challenge_method: null }),
    );

    expect(failure.issues).toEqual([{ code: "invalid_request", path: ["code_challenge"] }]);
    expect(publicFailure.issues).toEqual([{ code: "invalid_request", path: ["code_challenge"] }]);
  });
});

describe("requirePkce: false on a public client", () => {
  it("throws TypeError when the record is read, at the authorization endpoint", async () => {
    const { signingKey } = await setUpProvider();
    const provider = createProvider({
      issuer: ISSUER,
      signingKeys: [signingKey],
      store: createMemoryStore({
        clients: [
          {
            clientId: PUBLIC_CLIENT,
            redirectUris: [REDIRECT_URI],
            scopes: ["openid"],
            auth: { method: "none" },
            requirePkce: false,
          },
        ],
      }),
      claims: () => ({}),
    });

    await expect(provider.beginAuthorization(new Request(authorizationUrl({ code_challenge: null })))).rejects.toThrow(
      TypeError,
    );
  });
});
