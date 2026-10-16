import { describe, expect, it, vi } from "vitest";

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
