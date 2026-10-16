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

    expect(token).not.toBeNull();
    expect(token?.status).toBeGreaterThanOrEqual(400);
    expect(token?.status).toBeLessThan(500);
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
