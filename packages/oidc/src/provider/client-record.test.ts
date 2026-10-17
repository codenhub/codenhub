import { describe, expect, it } from "vitest";

import { checkClientRecord } from "./client-record";
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
        auth: { method: "client_secret_basic", secretHash: "hash" },
        grantTypes: ["client_credentials"],
        ...overrides,
      });

    it("shouldAcceptAClientCredentialsClientWithNoRedirectUriAndNoOpenid", () => {
      expect(checkClientRecord(machine(), "client-a").grantTypes).toEqual(["client_credentials"]);
    });

    it("shouldAcceptBothGrants", () => {
      const record = valid({
        auth: { method: "client_secret_basic", secretHash: "hash" },
        grantTypes: ["authorization_code", "client_credentials"],
      });

      expect(checkClientRecord(record, "client-a").grantTypes).toEqual(["authorization_code", "client_credentials"]);
    });

    it("shouldStillRequireOpenidAndARedirectUriForAuthorizationCode", () => {
      expect(() =>
        checkClientRecord(machine({ grantTypes: ["authorization_code", "client_credentials"] }), "client-a"),
      ).toThrow("at least one for authorization_code");
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

  it("shouldRejectClientSecretPostWithoutSecretHash", () => {
    expect(() => checkClientRecord(valid({ auth: { method: "client_secret_post" } }), "client-a")).toThrow(TypeError);
  });

  it("shouldRejectClientSecretBasicWithAnEmptySecretHash", () => {
    expect(() =>
      checkClientRecord(valid({ auth: { method: "client_secret_basic", secretHash: "" } }), "client-a"),
    ).toThrow(TypeError);
  });

  it("shouldAcceptClientSecretPostWithASecretHash", () => {
    expect(() =>
      checkClientRecord(valid({ auth: { method: "client_secret_post", secretHash: "hash" } }), "client-a"),
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
});
