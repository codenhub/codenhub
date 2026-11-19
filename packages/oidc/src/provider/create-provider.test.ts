import { generateKeyPair, type KeyPair } from "@codenhub/jwt";
import { describe, expect, it } from "vitest";

import { createMemoryStore, type MemoryStore } from "../testing/memory-store";
import { createProvider } from "./create-provider";
import type { ProviderOptions } from "./types";

const ISSUER = "https://op.example";
const DISCOVERY = `${ISSUER}/.well-known/openid-configuration`;
const JWKS = `${ISSUER}/jwks`;

const keyPair = (kid: string): Promise<KeyPair> => generateKeyPair({ alg: "ES256", kid });

const optionsWith = async (overrides: Partial<ProviderOptions> = {}): Promise<ProviderOptions> => ({
  issuer: ISSUER,
  signingKeys: [await keyPair("2026-10")],
  store: createMemoryStore(),
  claims: () => ({}),
  ...overrides,
});

describe("createProvider", () => {
  it("shouldThrowTypeErrorWhenIssuerIsNotHttps", async () => {
    const options = await optionsWith({ issuer: "http://op.example" });

    expect(() => createProvider(options)).toThrow(TypeError);
  });

  it("shouldThrowTypeErrorWhenStoreLacksAMethod", async () => {
    const store: Partial<MemoryStore> = createMemoryStore();
    delete store.findClient;
    const options = await optionsWith({ store: store as unknown as ProviderOptions["store"] });

    expect(() => createProvider(options)).toThrow(TypeError);
  });

  it("shouldThrowTypeErrorWhenTwoSigningKeysShareAKid", async () => {
    const options = await optionsWith({ signingKeys: [await keyPair("same"), await keyPair("same")] });

    expect(() => createProvider(options)).toThrow(TypeError);
  });

  it("shouldThrowTypeErrorWhenCodeLifetimeIsOutOfRange", async () => {
    const options = await optionsWith({ ttl: { code: 0 } });

    expect(() => createProvider(options)).toThrow(TypeError);
  });

  it("shouldThrowTypeErrorWhenTtlIsExplicitlyNull", async () => {
    const options = await optionsWith({ ttl: { code: null } as unknown as ProviderOptions["ttl"] });

    expect(() => createProvider(options)).toThrow(TypeError);
  });

  it("shouldThrowTypeErrorWhenScopesIsAnArray", async () => {
    const options = await optionsWith({
      scopes: [["email"]] as unknown as ProviderOptions["scopes"],
    });

    expect(() => createProvider(options)).toThrow(TypeError);
  });

  it("shouldThrowTypeErrorWhenOnRefreshIsNotAFunction", async () => {
    const options = await optionsWith({ onRefresh: true as unknown as ProviderOptions["onRefresh"] });

    expect(() => createProvider(options)).toThrow(TypeError);
  });

  it("shouldAcceptAnOnRefreshFunction", async () => {
    const options = await optionsWith({ onRefresh: () => true });

    expect(() => createProvider(options)).not.toThrow();
  });

  it.each([
    ["empty", []],
    ["not an array", "pairwise"],
    ["an unknown type", ["public", "ephemeral"]],
    ["a repeated type", ["pairwise", "pairwise"]],
    ["sparse", Object.assign([] as string[], { 1: "public" })],
    ["null", null],
  ])("shouldThrowTypeErrorWhenSubjectTypesIs %s", async (_name, subjectTypes) => {
    const options = await optionsWith({ subjectTypes: subjectTypes as ProviderOptions["subjectTypes"] });

    expect(() => createProvider(options)).toThrow(
      expect.objectContaining({ name: "TypeError", message: expect.stringContaining("subjectTypes") }),
    );
  });

  it("shouldNotRepeatTheSubjectTypesInItsMessage", async () => {
    const options = await optionsWith({ subjectTypes: ["secret-type"] as unknown as ProviderOptions["subjectTypes"] });

    expect(() => createProvider(options)).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("secret-type") }),
    );
  });

  it("shouldThrowTypeErrorWhenAnEndpointIsExplicitlyNull", async () => {
    const options = await optionsWith({ endpoints: { token: null } as unknown as ProviderOptions["endpoints"] });

    expect(() => createProvider(options)).toThrow(TypeError);
  });
});

describe("provider.handle", () => {
  it("shouldAnswerDiscoveryWithMetadataAsJsonWithCorsAndPublicCaching", async () => {
    const provider = createProvider(await optionsWith());

    const response = await provider.handle(new Request(DISCOVERY));

    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-type")).toBe("application/json");
    expect(response?.headers.get("access-control-allow-origin")).toBe("*");
    expect(response?.headers.get("cache-control")).toBe("public, max-age=300");
    expect(await response?.json()).toMatchObject({ issuer: ISSUER, jwks_uri: JWKS });
  });

  it("shouldRespond405ToPostOnDiscovery", async () => {
    const provider = createProvider(await optionsWith());

    const response = await provider.handle(new Request(DISCOVERY, { method: "POST" }));

    expect(response?.status).toBe(405);
    expect(response?.headers.get("allow")).toBe("GET, OPTIONS");
  });

  it("shouldRespond204ToPreflightOnDiscovery", async () => {
    const provider = createProvider(await optionsWith());

    const response = await provider.handle(new Request(DISCOVERY, { method: "OPTIONS" }));

    expect(response?.status).toBe(204);
    expect(response?.headers.get("access-control-allow-methods")).toBe("GET");
  });

  it("shouldReturnNullForAnUnknownPath", async () => {
    const provider = createProvider(await optionsWith());

    expect(await provider.handle(new Request(`${ISSUER}/unknown`))).toBeNull();
  });

  it("shouldReturnNullForTheAuthorizationEndpoint", async () => {
    const provider = createProvider(await optionsWith());

    expect(await provider.handle(new Request(`${ISSUER}/authorize?client_id=client-1`))).toBeNull();
  });

  it("shouldMatchDiscoveryWhenTheQueryStringIsPresent", async () => {
    const provider = createProvider(await optionsWith());

    const response = await provider.handle(new Request(`${DISCOVERY}?cache=1`));

    expect(response?.status).toBe(200);
  });

  it("shouldReturnNullForTheSamePathOnAnotherOrigin", async () => {
    const provider = createProvider(await optionsWith());

    expect(await provider.handle(new Request("https://evil.example/.well-known/openid-configuration"))).toBeNull();
  });

  it("shouldAnswerJwksWithOneKeyPerSigningKey", async () => {
    const provider = createProvider(
      await optionsWith({ signingKeys: [await keyPair("2026-10"), await keyPair("2026-11")] }),
    );

    const response = await provider.handle(new Request(JWKS));
    const body = (await response?.json()) as { keys: { kid?: string }[] };

    expect(response?.status).toBe(200);
    expect(body.keys.map((key) => key.kid)).toEqual(["2026-10", "2026-11"]);
  });

  it("shouldRouteTokenRequestsToTheTokenHandler", async () => {
    const provider = createProvider(await optionsWith());

    const response = await provider.handle(new Request(`${ISSUER}/token`));

    expect(response?.status).toBe(405);
    expect(response?.headers.get("allow")).toBe("POST, OPTIONS");
  });

  it("shouldRouteUserinfoRequestsToTheUserinfoHandler", async () => {
    const provider = createProvider(await optionsWith());

    const response = await provider.handle(new Request(`${ISSUER}/userinfo`));

    expect(response?.status).toBe(401);
    expect(response?.headers.get("www-authenticate")).toBe("Bearer");
  });

  it("shouldServeEndpointsUnderTheIssuerPath", async () => {
    const provider = createProvider(await optionsWith({ issuer: "https://op.example/tenant" }));

    const response = await provider.handle(new Request("https://op.example/tenant/.well-known/openid-configuration"));

    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({ token_endpoint: "https://op.example/tenant/token" });
  });

  it("shouldHandleTokenJwksAndUserinfoUnderTheIssuerPath", async () => {
    const provider = createProvider(await optionsWith({ issuer: "https://op.example/tenant" }));

    const token = await provider.handle(new Request("https://op.example/tenant/token", { method: "POST" }));
    const jwks = await provider.handle(new Request("https://op.example/tenant/jwks"));
    const userinfo = await provider.handle(new Request("https://op.example/tenant/userinfo"));

    // A POST without a form body reaches the token endpoint and is refused there as `invalid_request`.
    expect(token?.status).toBe(400);
    expect(await token?.json()).toEqual({ error: "invalid_request" });
    expect(jwks?.status).toBe(200);
    expect(userinfo?.status).toBe(401);
  });

  it("shouldReturnNullForTheDiscoveryPathOutsideTheIssuerPath", async () => {
    const provider = createProvider(await optionsWith({ issuer: "https://op.example/tenant" }));

    expect(await provider.handle(new Request(DISCOVERY))).toBeNull();
  });
});

describe("createProvider result", () => {
  it("shouldExposeTheMetadataItPublishes", async () => {
    const provider = createProvider(await optionsWith());

    expect(provider.metadata.issuer).toBe(ISSUER);
  });

  it("shouldReturnAFrozenProvider", async () => {
    const provider = createProvider(await optionsWith());

    expect(Object.isFrozen(provider)).toBe(true);
  });
});

/** The `TypeError` `createProvider` throws for `options`, or `undefined` when it throws none. */
function thrownBy(options: ProviderOptions): TypeError | undefined {
  try {
    createProvider(options);
    return undefined;
  } catch (error) {
    if (!(error instanceof TypeError)) {
      throw error;
    }
    return error;
  }
}

describe("createProvider verificationKeys", () => {
  it("publishes each verification key after the signing keys' public halves", async () => {
    const incoming = await keyPair("2026-11");
    const provider = createProvider(await optionsWith({ verificationKeys: [incoming.publicKey] }));

    const body = (await (await provider.handle(new Request(JWKS)))?.json()) as { keys: { kid?: string }[] };

    expect(body.keys.map((key) => key.kid)).toEqual(["2026-10", "2026-11"]);
  });

  it("does not advertise a verification key's algorithm for ID tokens, since it never signs", async () => {
    const incoming = await generateKeyPair({ alg: "EdDSA", kid: "2026-11" });
    const provider = createProvider(await optionsWith({ verificationKeys: [incoming.publicKey] }));

    expect(provider.metadata.id_token_signing_alg_values_supported).toEqual(["ES256"]);
  });

  it.each([
    ["not an array", "key"],
    ["a private key", "private"],
    ["a key pair", "pair"],
    ["a key without kid", "no-kid"],
    ["sparse", "sparse"],
  ])("throws TypeError naming verificationKeys for %s", async (_label, shape) => {
    const pair = await keyPair("2026-11");
    const unkeyed = await generateKeyPair({ alg: "ES256" });
    const value =
      shape === "key"
        ? pair.publicKey
        : shape === "private"
          ? [pair.privateKey]
          : shape === "pair"
            ? [pair]
            : shape === "no-kid"
              ? [unkeyed.publicKey]
              : Object.assign([], { 1: pair.publicKey });
    const thrown = thrownBy(
      await optionsWith({ verificationKeys: value as unknown as ProviderOptions["verificationKeys"] }),
    );

    expect(thrown?.message).toContain("verificationKeys");
  });

  it("throws TypeError for two verification keys with one kid", async () => {
    const first = await keyPair("2026-11");
    const second = await keyPair("2026-11");

    expect(thrownBy(await optionsWith({ verificationKeys: [first.publicKey, second.publicKey] }))?.message).toContain(
      "verificationKeys",
    );
  });

  it("throws TypeError for a verification key with a signing key's kid", async () => {
    const twin = await keyPair("2026-10");

    expect(thrownBy(await optionsWith({ verificationKeys: [twin.publicKey] }))?.message).toContain("verificationKeys");
  });
});

describe("createProvider unknown options", () => {
  it.each([
    ["a top-level option", { issuers: ISSUER }, "createProvider: issuers is not an option"],
    [
      "an endpoint",
      { endpoints: { authorize: `${ISSUER}/auth` } },
      "createProvider: endpoints.authorize is not an option",
    ],
    ["a lifetime", { ttl: { accessTokens: 600 } }, "createProvider: ttl.accessTokens is not an option"],
    [
      "an access token member",
      { accessToken: { format: "jwt", audience: "https://api.example", aud: "x" } },
      "createProvider: accessToken.aud is not an option",
    ],
    [
      "an opaque token's audience",
      { accessToken: { format: "opaque", audience: "https://api.example" } },
      "createProvider: accessToken.audience is not an option",
    ],
    ["an undefined member", { onDiagnostics: undefined }, "createProvider: onDiagnostics is not an option"],
  ])("throws TypeError naming %s", async (_label, extra, message) => {
    const thrown = thrownBy({ ...(await optionsWith()), ...(extra as Partial<ProviderOptions>) });

    expect(thrown?.message).toBe(message);
  });

  it("cuts a long unknown name in its message", async () => {
    const name = "x".repeat(200);
    const thrown = thrownBy({ ...(await optionsWith()), [name]: true } as ProviderOptions);

    expect(thrown?.message).toBe(`createProvider: ${"x".repeat(64)}... is not an option`);
  });

  it("accepts every documented option", async () => {
    const options = await optionsWith({
      scopes: { "read:orders": ["order_count"] },
      ttl: { code: 60, interaction: 1800, accessToken: 600, idToken: 600, refreshToken: 86400 },
      accessToken: { format: "jwt", audience: "https://api.example" },
      accessTokenClaims: () => ({}),
      endpoints: {
        authorization: `${ISSUER}/a`,
        token: `${ISSUER}/t`,
        userinfo: `${ISSUER}/u`,
        jwks: `${ISSUER}/j`,
        revocation: `${ISSUER}/r`,
        endSession: `${ISSUER}/l`,
      },
      now: Date.now,
      onDiagnostic: () => undefined,
      onRefresh: () => true,
      subjectTypes: ["public"],
      verificationKeys: [],
      metadata: {},
    });

    expect(thrownBy(options)).toBeUndefined();
  });
});

describe("createProvider canonical URLs", () => {
  it.each(["https://op.example", "https://op.example/", "https://op.example/tenant", "https://op.example/a%20b"])(
    "accepts the canonical issuer %s",
    async (issuer) => {
      expect(thrownBy(await optionsWith({ issuer }))).toBeUndefined();
    },
  );

  it.each([
    "https://OP.example",
    "HTTPS://op.example",
    "https://op.example:443",
    "https://op.example:443/",
    "https://op.example/a/../b",
    "https://op.example/./tenant",
    "https://op.example/{tenant}",
    "https://op.example/%2e%2e/b",
    "https://0x7f.0.0.1",
  ])("throws TypeError for the non-canonical issuer %s", async (issuer) => {
    const thrown = thrownBy(await optionsWith({ issuer }));

    expect(thrown?.message).toMatch(/^createProvider: issuer /);
    expect(thrown?.message).not.toContain(issuer);
  });

  it("explains the canonical form in the message", async () => {
    expect(thrownBy(await optionsWith({ issuer: "https://OP.example" }))?.message).toBe(
      "createProvider: issuer must be written as the URL parser serializes it: a lowercase scheme and host, no default port, no dot segments, and percent-encoding as the parser writes it",
    );
  });

  it.each(["https://OP.example/token", "https://op.example:443/token", "https://op.example/x/../token"])(
    "throws TypeError for the non-canonical endpoint %s",
    async (token) => {
      expect(thrownBy(await optionsWith({ endpoints: { token } }))?.message).toMatch(
        /^createProvider: endpoints\.token must be written as the URL parser serializes it/,
      );
    },
  );

  it("accepts an endpoint on its own origin with an empty path", async () => {
    expect(thrownBy(await optionsWith({ endpoints: { token: "https://token.example" } }))).toBeUndefined();
  });
});

describe("createProvider metadata", () => {
  it("merges extra members into discovery after the computed ones", async () => {
    const extra = {
      acr_values_supported: ["urn:example:loa:1", "urn:example:loa:2"],
      ui_locales_supported: ["en", "pt-BR"],
      op_policy_uri: "https://sso.example/policy",
      service_documentation: "https://sso.example/docs",
    };
    const provider = createProvider(await optionsWith({ metadata: extra }));

    const body = (await (await provider.handle(new Request(DISCOVERY)))?.json()) as Record<string, unknown>;

    expect(body).toMatchObject({ issuer: ISSUER, ...extra });
    expect(Object.keys(body).slice(-4)).toEqual(Object.keys(extra));
  });

  it("keeps a deep-frozen copy, so a later change to the option does not reach discovery", async () => {
    const locales = ["en"];
    const nested = { region: { name: "eu" } };
    const provider = createProvider(await optionsWith({ metadata: { ui_locales_supported: locales, nested } }));
    locales.push("fr");
    nested.region.name = "us";

    expect(provider.metadata.ui_locales_supported).toEqual(["en"]);
    expect(provider.metadata.nested).toEqual({ region: { name: "eu" } });
    expect(Object.isFrozen(provider.metadata.ui_locales_supported)).toBe(true);
  });

  it("keeps a member named __proto__ as a plain member", async () => {
    const metadata = JSON.parse('{"__proto__": {"polluted": true}}') as Record<string, unknown>;
    const provider = createProvider(await optionsWith({ metadata }));

    expect(Object.hasOwn(provider.metadata, "__proto__")).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it.each(["issuer", "response_modes_supported", "prompt_values_supported", "jwks_uri", "claims_parameter_supported"])(
    "throws TypeError for %s, which the provider computes",
    async (member) => {
      expect(thrownBy(await optionsWith({ metadata: { [member]: "x" } }))?.message).toBe(
        `createProvider: metadata.${member} is a member the provider computes`,
      );
    },
  );

  class Policy {
    readonly uri = "https://sso.example/policy";
  }

  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;

  it.each([
    ["not an object", "x"],
    ["an array", []],
    ["undefined", { a: undefined }],
    ["a function", { a: () => 1 }],
    ["NaN", { a: Number.NaN }],
    ["Infinity", { a: [Infinity] }],
    ["a bigint", { a: 1n }],
    ["a Date", { a: new Date(0) }],
    ["a class instance", { a: new Policy() }],
    ["a lone surrogate", { a: "\uD800" }],
    ["a sparse array", { a: Object.assign([], { 1: "x" }) }],
    ["an empty name", { "": "x" }],
    ["a cycle", { a: cyclic }],
    ["too deep a value", { a: JSON.parse(`${"[".repeat(40)}${"]".repeat(40)}`) as unknown }],
    ["too large a value", { a: "x".repeat(20_000) }],
  ])("throws TypeError naming metadata for %s", async (_label, metadata) => {
    const thrown = thrownBy(await optionsWith({ metadata: metadata as ProviderOptions["metadata"] }));

    expect(thrown?.message).toMatch(/^createProvider: metadata/);
  });

  it("accepts null, booleans, numbers, strings, arrays and plain objects", async () => {
    const metadata = { a: null, b: true, c: 1.5, d: "text", e: [1, "two", { three: [null] }], f: Object.create(null) };

    expect(thrownBy(await optionsWith({ metadata }))).toBeUndefined();
  });
});
