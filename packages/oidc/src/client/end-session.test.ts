import { describe, expect, it } from "vitest";

import type { ProviderMetadata } from "../shared/types";
import { createClient } from "./create-client";
import type { EndSessionOptions } from "./types";

const ISSUER = "https://op.example";

const metadata: ProviderMetadata = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/authorize`,
  token_endpoint: `${ISSUER}/token`,
  jwks_uri: `${ISSUER}/jwks`,
  end_session_endpoint: `${ISSUER}/logout?tenant=a`,
  response_types_supported: ["code"],
  subject_types_supported: ["public"],
  id_token_signing_alg_values_supported: ["ES256"],
};

const client = (overrides: Partial<ProviderMetadata> = {}) =>
  createClient({
    metadata: { ...metadata, ...overrides },
    clientId: "web",
    redirectUri: "https://app.example/cb",
    auth: { method: "none" },
  });

describe("endSessionUrl", () => {
  it("builds the logout request, keeping the endpoint's query and always sending client_id", () => {
    const url = client().endSessionUrl({
      idTokenHint: "a.b.c",
      postLogoutRedirectUri: "https://app.example/signed-out",
      state: "s1",
      logoutHint: "ada@example.com",
      uiLocales: ["pt-BR", "en"],
    });

    expect(url).toBe(
      `${ISSUER}/logout?tenant=a&id_token_hint=a.b.c&logout_hint=ada%40example.com&client_id=web` +
        "&post_logout_redirect_uri=https%3A%2F%2Fapp.example%2Fsigned-out&state=s1&ui_locales=pt-BR+en",
    );
  });

  it("sends only client_id when given nothing", () => {
    expect(client().endSessionUrl()).toBe(`${ISSUER}/logout?tenant=a&client_id=web`);
  });

  it("throws a TypeError when the provider has no end_session_endpoint", () => {
    expect(() => client({ end_session_endpoint: undefined }).endSessionUrl()).toThrow("end_session_endpoint");
  });

  it.each([
    ["a javascript: postLogoutRedirectUri", { postLogoutRedirectUri: "javascript:alert(1)" }, "postLogoutRedirectUri"],
    [
      "a postLogoutRedirectUri with a fragment",
      { postLogoutRedirectUri: "https://app.example/#x" },
      "postLogoutRedirectUri",
    ],
    ["a non-string state", { state: 42 }, "state"],
    ["a lone surrogate in logoutHint", { logoutHint: "\uD800" }, "logoutHint"],
    ["an oversized idTokenHint", { idTokenHint: "a".repeat(4097) }, "idTokenHint"],
    ["a uiLocales entry with a space", { uiLocales: ["pt BR"] }, "uiLocales"],
    ["a URL over the provider's limit once encoded", { state: "é".repeat(1500) }, "8192"],
  ])("throws a TypeError for %s, naming it", (_name, options, member) => {
    expect(() => client().endSessionUrl(options as EndSessionOptions)).toThrow(member);
  });
});
