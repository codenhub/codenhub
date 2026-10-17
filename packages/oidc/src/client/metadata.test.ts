import { describe, expect, it, vi } from "vitest";

import { MAX_PARAMETER_LENGTH } from "../shared/limits";
import type { OidcIssue, OidcResult, ProviderMetadata } from "../shared/types";
import { checkMetadata } from "./metadata";

const ISSUER = "https://login.example.com";

const validDocument = (): Record<string, unknown> => ({
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/authorize`,
  token_endpoint: `${ISSUER}/token`,
  jwks_uri: `${ISSUER}/jwks`,
  userinfo_endpoint: `${ISSUER}/userinfo`,
  response_types_supported: ["code"],
  subject_types_supported: ["public"],
  id_token_signing_alg_values_supported: ["ES256"],
  code_challenge_methods_supported: ["S256"],
});

const issuesOf = (result: OidcResult<unknown>): readonly OidcIssue[] => {
  if (result.ok) {
    throw new Error("expected a failed result");
  }
  return result.error.issues;
};

/** The value of a successful result; a failed one throws, so an assertion on it cannot pass vacuously. */
const valueOf = (result: OidcResult<ProviderMetadata>): ProviderMetadata => {
  if (!result.ok) {
    throw new Error("expected a successful result");
  }
  return result.value;
};

describe("checkMetadata", () => {
  it("accepts a valid document", () => {
    expect(checkMetadata(validDocument(), ISSUER).ok).toBe(true);
  });

  it("returns a copy with the document's members", () => {
    const document = validDocument();
    const result = checkMetadata(document, ISSUER);

    expect(result).toEqual({ ok: true, value: document });
    expect(valueOf(result)).not.toBe(document);
  });

  it("returns a frozen copy that leaves the caller's document unfrozen", () => {
    const document = validDocument();
    const result = checkMetadata(document, ISSUER);

    expect(Object.isFrozen(valueOf(result))).toBe(true);
    expect(Object.isFrozen(document)).toBe(false);
  });

  it("copies arrays so the caller's arrays are not frozen", () => {
    const document = validDocument();
    const copy = valueOf(checkMetadata(document, ISSUER));

    expect(Object.isFrozen(copy.response_types_supported)).toBe(true);
    expect(copy.response_types_supported).not.toBe(document.response_types_supported);
    expect(Object.isFrozen(document.response_types_supported)).toBe(false);
  });

  it("copies a nested object in an unlisted member so the caller's object is not frozen", () => {
    const document = { ...validDocument(), vendor: { nested: { list: [1, 2] } } };
    const copy = valueOf(checkMetadata(document, ISSUER));

    expect(copy.vendor).toEqual({ nested: { list: [1, 2] } });
    expect(copy.vendor).not.toBe(document.vendor);
    expect(Object.isFrozen(copy.vendor)).toBe(true);
    expect(Object.isFrozen(document.vendor)).toBe(false);
    expect(Object.isFrozen(document.vendor.nested.list)).toBe(false);
    const nested = (copy.vendor as { nested: { list: number[] } }).nested;
    expect(Object.isFrozen(nested)).toBe(true);
    expect(Object.isFrozen(nested.list)).toBe(true);
  });

  it("refuses a member nested deeper than the copy allows, without overflowing the stack", () => {
    let deep: unknown = "leaf";
    for (let level = 0; level < 100_000; level += 1) {
      deep = [deep];
    }

    expect(issuesOf(checkMetadata({ ...validDocument(), vendor: deep }, ISSUER))).toEqual([
      { code: "invalid_metadata", path: ["metadata"] },
    ]);
  });

  it("refuses a string array with a hole", () => {
    // oxlint-disable-next-line no-sparse-arrays -- the hole is what this test is about
    const document = { ...validDocument(), scopes_supported: ["openid", , "email"] };

    expect(issuesOf(checkMetadata(document, ISSUER))).toEqual([{ code: "invalid_metadata", path: ["metadata"] }]);
  });

  it("refuses an array carrying a named member", () => {
    const scopes = Object.assign(["openid"], { extra: "x" });

    expect(issuesOf(checkMetadata({ ...validDocument(), scopes_supported: scopes }, ISSUER))).toEqual([
      { code: "invalid_metadata", path: ["metadata"] },
    ]);
  });

  it("keeps a __proto__ member as an own property", () => {
    const document = JSON.parse(`{"vendor":{"__proto__":{"polluted":true}}}`) as Record<string, unknown>;
    const copy = valueOf(checkMetadata({ ...validDocument(), ...document }, ISSUER));
    const vendor = copy.vendor as Record<string, unknown>;

    expect(Object.hasOwn(vendor, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(vendor)).toBe(Object.prototype);
  });

  it("copies a nested array inside a listed member so the caller's array is not frozen", () => {
    const document = { ...validDocument(), scopes_supported: ["openid", "profile"] };
    const copy = valueOf(checkMetadata(document, ISSUER));

    expect(copy.scopes_supported).not.toBe(document.scopes_supported);
    expect(Object.isFrozen(document.scopes_supported)).toBe(false);
  });

  it("refuses a getter nested inside an unlisted member without running it", () => {
    const document = validDocument();
    const getter = vi.fn(() => "value");
    document.vendor = Object.defineProperty({}, "hidden", { get: getter, enumerable: true });

    const issues = issuesOf(checkMetadata(document, ISSUER));

    expect(getter).not.toHaveBeenCalled();
    expect(issues).toEqual([{ code: "invalid_metadata", path: ["metadata"] }]);
  });

  it("refuses a getter nested inside a listed member without running it", () => {
    const document = validDocument();
    const getter = vi.fn(() => "code");
    document.response_types_supported = Object.defineProperty([], 0, { get: getter, enumerable: true });

    const issues = issuesOf(checkMetadata(document, ISSUER));

    expect(getter).not.toHaveBeenCalled();
    expect(issues).toEqual([{ code: "invalid_metadata", path: ["metadata"] }]);
  });

  it("refuses a cyclic member without a stack overflow", () => {
    const document = validDocument();
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    document.vendor = cycle;

    expect(issuesOf(checkMetadata(document, ISSUER))).toEqual([{ code: "invalid_metadata", path: ["metadata"] }]);
  });

  it("refuses a document that refers to itself", () => {
    const document = validDocument();
    document.vendor = document;

    expect(issuesOf(checkMetadata(document, ISSUER))).toEqual([{ code: "invalid_metadata", path: ["metadata"] }]);
  });

  it("accepts an array that two members share, and copies it", () => {
    const document = validDocument();
    const algorithms = ["ES256"];
    document.id_token_signing_alg_values_supported = algorithms;
    document.token_endpoint_auth_signing_alg_values_supported = algorithms;

    const copy = valueOf(checkMetadata(document, ISSUER));

    expect(copy).toEqual(document);
    expect(copy.id_token_signing_alg_values_supported).not.toBe(algorithms);
    expect(copy.token_endpoint_auth_signing_alg_values_supported).not.toBe(algorithms);
    expect(copy.id_token_signing_alg_values_supported).not.toBe(copy.token_endpoint_auth_signing_alg_values_supported);
  });

  it("refuses an authorization_endpoint longer than MAX_PARAMETER_LENGTH", () => {
    const document = validDocument();
    document.authorization_endpoint = `${ISSUER}/${"a".repeat(MAX_PARAMETER_LENGTH)}`;

    expect(issuesOf(checkMetadata(document, ISSUER))).toEqual([
      { code: "invalid_metadata", path: ["metadata", "authorization_endpoint"] },
    ]);
  });

  it("accepts an authorization_endpoint of exactly MAX_PARAMETER_LENGTH characters", () => {
    const document = validDocument();
    document.authorization_endpoint = `${ISSUER}/${"a".repeat(MAX_PARAMETER_LENGTH - `${ISSUER}/`.length)}`;

    expect(document.authorization_endpoint).toHaveLength(MAX_PARAMETER_LENGTH);
    expect(checkMetadata(document, ISSUER).ok).toBe(true);
  });

  it("refuses an end_session_endpoint one character longer than MAX_PARAMETER_LENGTH", () => {
    const document = validDocument();
    document.end_session_endpoint = `${ISSUER}/${"a".repeat(MAX_PARAMETER_LENGTH + 1 - `${ISSUER}/`.length)}`;

    expect(document.end_session_endpoint).toHaveLength(MAX_PARAMETER_LENGTH + 1);
    expect(issuesOf(checkMetadata(document, ISSUER))).toEqual([
      { code: "invalid_metadata", path: ["metadata", "end_session_endpoint"] },
    ]);
  });

  it("accepts an end_session_endpoint of exactly MAX_PARAMETER_LENGTH characters", () => {
    const document = validDocument();
    document.end_session_endpoint = `${ISSUER}/${"a".repeat(MAX_PARAMETER_LENGTH - `${ISSUER}/`.length)}`;

    expect(document.end_session_endpoint).toHaveLength(MAX_PARAMETER_LENGTH);
    expect(checkMetadata(document, ISSUER).ok).toBe(true);
  });

  it.each(["revocation_endpoint_auth_methods_supported", "revocation_endpoint_auth_signing_alg_values_supported"])(
    "refuses %s that is not an array of strings",
    (member) => {
      const document = validDocument();
      document[member] = "client_secret_basic";

      expect(issuesOf(checkMetadata(document, ISSUER))).toEqual([
        { code: "invalid_metadata", path: ["metadata", member] },
      ]);
    },
  );

  it("accepts the revocation auth members when they are string arrays", () => {
    const document = {
      ...validDocument(),
      revocation_endpoint_auth_methods_supported: ["client_secret_basic"],
      revocation_endpoint_auth_signing_alg_values_supported: ["ES256"],
    };

    expect(checkMetadata(document, ISSUER).ok).toBe(true);
  });

  it("refuses a chain of shared references 40 levels deep without hanging", () => {
    let node: Record<string, unknown> = {};
    for (let level = 0; level < 40; level++) {
      node = { left: node, right: node };
    }
    const document = validDocument();
    document.vendor = node;

    expect(issuesOf(checkMetadata(document, ISSUER))).toEqual([{ code: "invalid_metadata", path: ["metadata"] }]);
  });

  it("refuses a chain of shared references within the depth limit by its node count", () => {
    let node: Record<string, unknown> = {};
    for (let level = 0; level < 30; level++) {
      node = { left: node, right: node };
    }
    const document = validDocument();
    document.vendor = node;

    expect(issuesOf(checkMetadata(document, ISSUER))).toEqual([{ code: "invalid_metadata", path: ["metadata"] }]);
  });

  it("keeps a member the package does not use", () => {
    const result = checkMetadata({ ...validDocument(), service_documentation: "docs" }, ISSUER);

    expect(valueOf(result).service_documentation).toBe("docs");
  });

  it("keeps a __proto__ member as data, not as the prototype", () => {
    const document = JSON.parse(`{"__proto__": {"polluted": true}, ${JSON.stringify(validDocument()).slice(1)}`);
    const copy = valueOf(checkMetadata(document, ISSUER));

    expect(Object.hasOwn(copy, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(copy)).toBe(Object.prototype);
  });

  it("accepts an optional member that is undefined", () => {
    expect(checkMetadata({ ...validDocument(), userinfo_endpoint: undefined }, ISSUER).ok).toBe(true);
  });

  it.each(["authorization_endpoint", "token_endpoint", "jwks_uri", "response_types_supported"])(
    "rejects a document missing %s with its path",
    (member) => {
      const document = validDocument();
      delete document[member];

      expect(issuesOf(checkMetadata(document, ISSUER))).toEqual([
        { code: "invalid_metadata", path: ["metadata", member] },
      ]);
    },
  );

  it("rejects a missing issuer as a mismatch", () => {
    const document = validDocument();
    delete document.issuer;

    expect(issuesOf(checkMetadata(document, ISSUER))).toEqual([
      { code: "issuer_mismatch", path: ["metadata", "issuer"] },
    ]);
  });

  it("rejects an issuer that differs by a trailing slash", () => {
    expect(issuesOf(checkMetadata({ ...validDocument(), issuer: `${ISSUER}/` }, ISSUER))).toEqual([
      { code: "issuer_mismatch", path: ["metadata", "issuer"] },
    ]);
  });

  it("rejects an http endpoint with its path", () => {
    const document = { ...validDocument(), token_endpoint: `http://login.example.com/token` };

    expect(issuesOf(checkMetadata(document, ISSUER))).toEqual([
      { code: "invalid_metadata", path: ["metadata", "token_endpoint"] },
    ]);
  });

  it("rejects an optional userinfo endpoint that is not https", () => {
    const document = { ...validDocument(), userinfo_endpoint: "http://login.example.com/userinfo" };

    expect(issuesOf(checkMetadata(document, ISSUER))).toEqual([
      { code: "invalid_metadata", path: ["metadata", "userinfo_endpoint"] },
    ]);
  });

  it("rejects code_challenge_methods_supported without S256", () => {
    const document = { ...validDocument(), code_challenge_methods_supported: ["plain"] };

    expect(issuesOf(checkMetadata(document, ISSUER))).toEqual([
      { code: "invalid_metadata", path: ["metadata", "code_challenge_methods_supported"] },
    ]);
  });

  it("rejects a provider that advertises only HS256 for ID tokens", () => {
    const document = { ...validDocument(), id_token_signing_alg_values_supported: ["HS256"] };

    expect(issuesOf(checkMetadata(document, ISSUER))).toEqual([
      { code: "invalid_metadata", path: ["metadata", "id_token_signing_alg_values_supported"] },
    ]);
  });

  it("rejects a response_types_supported that lacks code", () => {
    const document = { ...validDocument(), response_types_supported: ["id_token"] };

    expect(issuesOf(checkMetadata(document, ISSUER))).toEqual([
      { code: "invalid_metadata", path: ["metadata", "response_types_supported"] },
    ]);
  });

  it("rejects an optional boolean member that is not a boolean", () => {
    const document = { ...validDocument(), claims_parameter_supported: "yes" };

    expect(issuesOf(checkMetadata(document, ISSUER))).toEqual([
      { code: "invalid_metadata", path: ["metadata", "claims_parameter_supported"] },
    ]);
  });

  it("rejects an optional string array that holds a non-string", () => {
    const document = { ...validDocument(), scopes_supported: ["openid", 1] };

    expect(issuesOf(checkMetadata(document, ISSUER))).toEqual([
      { code: "invalid_metadata", path: ["metadata", "scopes_supported"] },
    ]);
  });

  it("collects every issue in one result", () => {
    const document = validDocument();
    delete document.jwks_uri;
    delete document.subject_types_supported;
    document.token_endpoint = "http://login.example.com/token";

    expect(issuesOf(checkMetadata(document, ISSUER)).map((issue) => issue.path)).toEqual([
      ["metadata", "token_endpoint"],
      ["metadata", "jwks_uri"],
      ["metadata", "subject_types_supported"],
    ]);
  });

  it("does not run a getter on a checked member", () => {
    const document = validDocument();
    const getter = vi.fn(() => `${ISSUER}/jwks`);
    delete document.jwks_uri;
    Object.defineProperty(document, "jwks_uri", { get: getter, enumerable: true });

    const issues = issuesOf(checkMetadata(document, ISSUER));

    expect(getter).not.toHaveBeenCalled();
    expect(issues).toEqual([{ code: "invalid_metadata", path: ["metadata", "jwks_uri"] }]);
  });

  it("refuses an accessor on a member the package does not read, without running it", () => {
    const document = validDocument();
    const getter = vi.fn(() => "value");
    Object.defineProperty(document, "vendor_extension", { get: getter, enumerable: true });

    const issues = issuesOf(checkMetadata(document, ISSUER));

    expect(getter).not.toHaveBeenCalled();
    expect(issues).toEqual([{ code: "invalid_metadata", path: ["metadata"] }]);
  });

  it("rejects a value that is not an object", () => {
    expect(issuesOf(checkMetadata("https://login.example.com", ISSUER))).toEqual([
      { code: "invalid_metadata", path: ["metadata"] },
    ]);
  });

  it("rejects an array as the document", () => {
    expect(issuesOf(checkMetadata([validDocument()], ISSUER))).toEqual([
      { code: "invalid_metadata", path: ["metadata"] },
    ]);
  });
});
