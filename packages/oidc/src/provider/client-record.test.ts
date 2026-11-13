import { describe, expect, it } from "vitest";

import { checkClientRecord, lifetimesOf } from "./client-record";
import type { ClientRecord } from "./types";

const valid = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  clientId: "client-a",
  redirectUris: ["https://app.example/callback"],
  scopes: ["openid"],
  auth: { method: "none" },
  ...overrides,
});

describe("checkClientRecord", () => {
  it("shouldAcceptAValidRecord", () => {
    const record = valid() as unknown as ClientRecord;

    expect(checkClientRecord(record, "client-a")).toEqual({ ...record, grantTypes: ["authorization_code"] });
  });

  it("shouldRejectARecordWithAnotherClientId", () => {
    expect(() => checkClientRecord(valid({ clientId: "client-b" }), "client-a")).toThrow(TypeError);
  });

  it.each([undefined, null, "client-a", 42])("shouldRejectANonObjectRecord_%s", (record) => {
    expect(() => checkClientRecord(record, "client-a")).toThrow(TypeError);
  });

  it("shouldRejectAnEmptyRedirectUriList", () => {
    expect(() => checkClientRecord(valid({ redirectUris: [] }), "client-a")).toThrow(TypeError);
  });

  it("shouldRejectARedirectUriWithAFragment", () => {
    expect(() => checkClientRecord(valid({ redirectUris: ["https://app.example/cb#x"] }), "client-a")).toThrow(
      TypeError,
    );
  });

  it("shouldRejectAJavascriptRedirectUriAndNameTheForbiddenSchemes", () => {
    const attempt = () => checkClientRecord(valid({ redirectUris: ["javascript:alert(1)"] }), "client-a");

    expect(attempt).toThrow(TypeError);
    expect(attempt).toThrow("not javascript:, data:, vbscript: or file:");
  });

  it("shouldRejectARedirectUriWithALoneSurrogate", () => {
    const attempt = () => checkClientRecord(valid({ redirectUris: ["https://app.example/cb\uD800"] }), "client-a");

    expect(attempt).toThrow(TypeError);
    expect(attempt).toThrow("of visible ASCII");
  });

  it("shouldRejectARecordWithoutOpenidScope", () => {
    expect(() => checkClientRecord(valid({ scopes: ["email"] }), "client-a")).toThrow(TypeError);
  });

  describe("grantTypes", () => {
    const machine = (overrides: Record<string, unknown> = {}): Record<string, unknown> =>
      valid({
        redirectUris: [],
        scopes: ["orders:read"],
        auth: { method: "client_secret_basic", secretHashes: ["hash"] },
        grantTypes: ["client_credentials"],
        ...overrides,
      });

    it("shouldAcceptAClientCredentialsClientWithNoRedirectUriAndNoOpenid", () => {
      expect(checkClientRecord(machine(), "client-a").grantTypes).toEqual(["client_credentials"]);
    });

    it("shouldAcceptBothGrants", () => {
      const record = valid({
        auth: { method: "client_secret_basic", secretHashes: ["hash"] },
        grantTypes: ["authorization_code", "client_credentials"],
      });

      expect(checkClientRecord(record, "client-a").grantTypes).toEqual(["authorization_code", "client_credentials"]);
    });

    it("shouldStillRequireARedirectUriForAuthorizationCode", () => {
      expect(() =>
        checkClientRecord(
          machine({ grantTypes: ["authorization_code", "client_credentials"], scopes: ["openid"] }),
          "client-a",
        ),
      ).toThrow("at least one for authorization_code");
    });

    it("shouldStillRequireOpenidForAuthorizationCodeWhenRedirectUrisArePresent", () => {
      expect(() =>
        checkClientRecord(
          machine({
            grantTypes: ["authorization_code", "client_credentials"],
            redirectUris: ["https://app.example/callback"],
          }),
          "client-a",
        ),
      ).toThrow("including openid for authorization_code");
    });

    it("shouldRejectClientCredentialsForAPublicClient", () => {
      expect(() => checkClientRecord(machine({ auth: { method: "none" } }), "client-a")).toThrow(
        "must not allow client_credentials to a client whose auth.method is none",
      );
    });

    it.each([
      ["an empty list", []],
      ["an unknown grant", ["password"]],
      ["the refresh grant, which comes with authorization_code", ["authorization_code", "refresh_token"]],
      ["a repeat", ["client_credentials", "client_credentials"]],
      ["a non-array", "client_credentials"],
    ])("shouldRejectGrantTypesWith%s", (_name, grantTypes) => {
      expect(() => checkClientRecord(machine({ grantTypes }), "client-a")).toThrow("grantTypes");
    });
  });

  it("shouldRejectAnUnsupportedAuthMethod", () => {
    expect(() => checkClientRecord(valid({ auth: { method: "tls_client_auth" } }), "client-a")).toThrow(TypeError);
  });

  it.each([
    ["missing", undefined],
    ["an empty list", []],
    ["an empty entry", ["hash", ""]],
    ["a non-string entry", ["hash", 42]],
    ["a single string, as the old secretHash member held", "hash"],
  ])("shouldRejectClientSecretBasicWithSecretHashes%s", (_name, secretHashes) => {
    const attempt = () =>
      checkClientRecord(valid({ auth: { method: "client_secret_basic", secretHashes } }), "client-a");

    expect(attempt).toThrow(TypeError);
    expect(attempt).toThrow("auth.secretHashes");
  });

  it("shouldAcceptSeveralSecretHashes", () => {
    expect(() =>
      checkClientRecord(valid({ auth: { method: "client_secret_basic", secretHashes: ["old", "new"] } }), "client-a"),
    ).not.toThrow();
  });

  it("shouldRejectClientSecretPostWithoutSecretHash", () => {
    expect(() => checkClientRecord(valid({ auth: { method: "client_secret_post" } }), "client-a")).toThrow(TypeError);
  });

  it("shouldAcceptClientSecretPostWithASecretHash", () => {
    expect(() =>
      checkClientRecord(valid({ auth: { method: "client_secret_post", secretHashes: ["hash"] } }), "client-a"),
    ).not.toThrow();
  });

  it("shouldRejectClientSecretJwtWithoutKey", () => {
    expect(() => checkClientRecord(valid({ auth: { method: "client_secret_jwt" } }), "client-a")).toThrow(TypeError);
  });

  it("shouldRejectPrivateKeyJwtWithKeysLackingSelect", () => {
    expect(() => checkClientRecord(valid({ auth: { method: "private_key_jwt", keys: {} } }), "client-a")).toThrow(
      TypeError,
    );
  });

  describe("ttl", () => {
    it("shouldAcceptEveryLifetimeAtItsBounds", () => {
      const low = { code: 1, accessToken: 60, idToken: 60, refreshToken: 60 };
      const high = { code: 600, accessToken: 86_400, idToken: 86_400, refreshToken: 31_536_000 };

      expect(() => checkClientRecord(valid({ ttl: low }), "client-a")).not.toThrow();
      expect(() => checkClientRecord(valid({ ttl: high }), "client-a")).not.toThrow();
    });

    it("shouldAcceptAnEmptyTtlAndKeepIt", () => {
      expect(checkClientRecord(valid({ ttl: {} }), "client-a").ttl).toEqual({});
    });

    it.each([
      ["code", 0],
      ["code", 601],
      ["accessToken", 59],
      ["accessToken", 86_401],
      ["idToken", 59],
      ["idToken", 86_401],
      ["refreshToken", 59],
      ["refreshToken", 31_536_001],
      ["code", 1.5],
      ["accessToken", Number.NaN],
      ["idToken", "600"],
      ["refreshToken", null],
    ])("shouldRejectTtl_%s_of_%s", (name, value) => {
      const attempt = () => checkClientRecord(valid({ ttl: { [name as string]: value } }), "client-a");

      expect(attempt).toThrow(TypeError);
      expect(attempt).toThrow(`ttl.${name}`);
    });

    it.each([
      ["a string", "600"],
      ["null", null],
      ["an array", [60]],
      ["a number", 60],
    ])("shouldRejectTtlThatIs%s", (_name, ttl) => {
      expect(() => checkClientRecord(valid({ ttl }), "client-a")).toThrow(TypeError);
    });

    it("shouldNotNameTheRejectedValue", () => {
      expect(() => checkClientRecord(valid({ ttl: { accessToken: 12_345_678 } }), "client-a")).toThrow(
        /^(?!.*12345678)/,
      );
    });
  });
});

describe("lifetimesOf", () => {
  const provider = { code: 60, interaction: 1800, accessToken: 600, idToken: 600, refreshToken: 2_592_000 };
  const client = (ttl?: Record<string, number>) => checkClientRecord(valid({ ttl }), "client-a");

  it("shouldReturnTheProviderLifetimesForAClientWithoutTtl", () => {
    expect(lifetimesOf(provider, client())).toEqual(provider);
  });

  it("shouldReplaceOnlyTheLifetimesTheClientSets", () => {
    expect(lifetimesOf(provider, client({ accessToken: 120, refreshToken: 3600 }))).toEqual({
      ...provider,
      accessToken: 120,
      refreshToken: 3600,
    });
  });

  it("shouldKeepTheProviderInteractionLifetime", () => {
    expect(lifetimesOf(provider, client({ code: 5 })).interaction).toBe(1800);
  });
});
