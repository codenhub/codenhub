import { generateKeyPair, generateSecretKey, type PrivateKey, type SecretKey } from "@codenhub/jwt";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { ProviderMetadata } from "../shared/types";
import { resolveClientOptions } from "./options";
import type { ClientAuth, ClientOptions } from "./types";

const ISSUER = "https://login.example.com";
const REDIRECT_URI = "https://app.example.com/callback";
const CLIENT_ID = "client-1";

const validMetadata = (): ProviderMetadata => ({
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/authorize`,
  token_endpoint: `${ISSUER}/token`,
  jwks_uri: `${ISSUER}/jwks`,
  response_types_supported: ["code"],
  subject_types_supported: ["public"],
  id_token_signing_alg_values_supported: ["ES256"],
});

const validOptions = (): ClientOptions => ({
  metadata: validMetadata(),
  clientId: CLIENT_ID,
  redirectUri: REDIRECT_URI,
  auth: { method: "none" },
});

/** Options with some members replaced, typed loosely because the tests pass values the types refuse. */
const withOptions = (overrides: Record<string, unknown>): ClientOptions =>
  ({ ...validOptions(), ...overrides }) as unknown as ClientOptions;

const withMetadata = (overrides: Record<string, unknown>): ClientOptions =>
  withOptions({ metadata: { ...validMetadata(), ...overrides } });

let privateKey: PrivateKey;
let secretKey: SecretKey;

beforeAll(async () => {
  ({ privateKey } = await generateKeyPair({ alg: "ES256" }));
  secretKey = await generateSecretKey({ alg: "HS256" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveClientOptions", () => {
  it("returns a frozen object", () => {
    expect(Object.isFrozen(resolveClientOptions(validOptions()))).toBe(true);
  });

  it("defaults the timeout to 5 seconds", () => {
    expect(resolveClientOptions(validOptions()).timeoutMs).toBe(5000);
  });

  it("converts a timeout in seconds to milliseconds", () => {
    expect(resolveClientOptions(withOptions({ timeout: 10 })).timeoutMs).toBe(10_000);
  });

  it("defaults the clock tolerance to zero", () => {
    expect(resolveClientOptions(validOptions()).clockTolerance).toBe(0);
  });

  it("keeps the clock tolerance it was given", () => {
    expect(resolveClientOptions(withOptions({ clockTolerance: 300 })).clockTolerance).toBe(300);
  });

  it("leaves fetch undefined when none was given, so the global one is used at each call", () => {
    expect(resolveClientOptions(validOptions()).fetch).toBeUndefined();
  });

  it("keeps the fetch it was given", () => {
    const fetchStub = vi.fn<typeof fetch>();

    expect(resolveClientOptions(withOptions({ fetch: fetchStub })).fetch).toBe(fetchStub);
  });

  it("reads the clock through Date.now at each call by default", () => {
    const resolved = resolveClientOptions(validOptions());
    const now = vi.spyOn(Date, "now");
    now.mockReturnValueOnce(42).mockReturnValueOnce(43);

    expect(resolved.now()).toBe(42);
    expect(resolved.now()).toBe(43);
    expect(now).toHaveBeenCalledTimes(2);
  });

  it("does not run a getter on metadata.issuer", () => {
    const getter = vi.fn(() => ISSUER);
    const metadata = validMetadata();
    Object.defineProperty(metadata, "issuer", { get: getter, enumerable: true });

    expect(() => resolveClientOptions(withOptions({ metadata }))).toThrow("metadata.issuer");
    expect(getter).not.toHaveBeenCalled();
  });

  it("throws TypeError for a clientId with a lone surrogate", () => {
    expect(() => resolveClientOptions(withOptions({ clientId: "client\uD800" }))).toThrow(TypeError);
  });

  it("throws TypeError for a redirectUri with a lone surrogate", () => {
    expect(() => resolveClientOptions(withOptions({ redirectUri: "https://app.example.com/\uDC00" }))).toThrow(
      TypeError,
    );
  });

  it("throws TypeError for an auth secret with a lone surrogate", () => {
    expect(() =>
      resolveClientOptions(withOptions({ auth: { method: "client_secret_basic", secret: "shh\uD800" } })),
    ).toThrow("auth.secret");
  });

  it("accepts a clientId with well-formed non-ASCII characters", () => {
    expect(resolveClientOptions(withOptions({ clientId: "cliente-ação-😀" })).clientId).toBe("cliente-ação-😀");
  });

  it("keeps the clock it was given", () => {
    const clock = (): number => 7;

    expect(resolveClientOptions(withOptions({ now: clock })).now()).toBe(7);
  });

  it("lists the ID token algorithms the provider advertises that the package verifies, in its own order", () => {
    const resolved = resolveClientOptions(
      withMetadata({ id_token_signing_alg_values_supported: ["RS256", "HS256", "ES256", "ES256"] }),
    );

    expect(resolved.idTokenAlgorithms).toEqual(["ES256", "RS256"]);
  });

  it("copies the auth options rather than keeping the caller's object", () => {
    const auth = { method: "none" } as const;

    expect(resolveClientOptions(withOptions({ auth })).auth).not.toBe(auth);
  });

  it("does not freeze the caller's metadata", () => {
    const metadata = validMetadata();
    resolveClientOptions(withOptions({ metadata }));

    expect(Object.isFrozen(metadata)).toBe(false);
  });

  it("throws TypeError when options is not an object", () => {
    expect(() => resolveClientOptions(undefined as unknown as ClientOptions)).toThrow(TypeError);
  });

  it("names the first failing metadata member in the TypeError message", () => {
    const metadata = { ...validMetadata(), jwks_uri: "http://login.example.com/jwks" };

    expect(() => resolveClientOptions(withOptions({ metadata }))).toThrow("metadata.jwks_uri");
  });

  it("throws TypeError when metadata is not an object", () => {
    expect(() => resolveClientOptions(withOptions({ metadata: "metadata" }))).toThrow(TypeError);
  });

  it("throws TypeError when the metadata issuer is missing", () => {
    expect(() => resolveClientOptions(withMetadata({ issuer: undefined }))).toThrow("metadata.issuer");
  });

  it.each([undefined, "", 12345])("throws TypeError for clientId %s", (clientId) => {
    expect(() => resolveClientOptions(withOptions({ clientId }))).toThrow(TypeError);
  });

  it("names clientId but never its value in the TypeError message", () => {
    expect(() => resolveClientOptions(withOptions({ clientId: 12345 }))).toThrow("clientId");
    expect(() => resolveClientOptions(withOptions({ clientId: 12345 }))).not.toThrow("12345");
  });

  it.each(["javascript:alert(1)", "https://app.example.com/cb#fragment", "not a uri"])(
    "throws TypeError for redirectUri %s",
    (redirectUri) => {
      expect(() => resolveClientOptions(withOptions({ redirectUri }))).toThrow(TypeError);
    },
  );

  it("throws TypeError when auth is missing", () => {
    expect(() => resolveClientOptions(withOptions({ auth: undefined }))).toThrow(TypeError);
  });

  it("throws TypeError for an unknown auth method", () => {
    expect(() => resolveClientOptions(withOptions({ auth: { method: "client_secret_jwt_plus" } }))).toThrow(
      "auth.method",
    );
  });

  it.each(["client_secret_basic", "client_secret_post"])("throws TypeError for %s with no secret", (method) => {
    expect(() => resolveClientOptions(withOptions({ auth: { method, secret: "" } }))).toThrow("auth.secret");
  });

  it("accepts client_secret_basic with a non-empty secret", () => {
    const resolved = resolveClientOptions(
      withOptions({ auth: { method: "client_secret_basic", secret: "shh-secret" } }),
    );

    expect(resolved.auth).toEqual({ method: "client_secret_basic", secret: "shh-secret" });
  });

  it("throws TypeError for client_secret_jwt given an asymmetric key", () => {
    expect(() => resolveClientOptions(withOptions({ auth: { method: "client_secret_jwt", key: privateKey } }))).toThrow(
      "auth.key",
    );
  });

  it("throws TypeError for private_key_jwt given a secret key", () => {
    expect(() =>
      resolveClientOptions(
        withOptions({
          auth: { method: "private_key_jwt", key: secretKey },
          metadata: { ...validMetadata(), token_endpoint_auth_methods_supported: ["private_key_jwt"] },
        }),
      ),
    ).toThrow("auth.key");
  });

  it("accepts client_secret_jwt with a secret key", () => {
    const auth: ClientAuth = { method: "client_secret_jwt", key: secretKey };

    expect(resolveClientOptions(withOptions({ auth })).auth).toEqual({ method: "client_secret_jwt", key: secretKey });
  });

  it("throws TypeError for an auth method the provider does not advertise", () => {
    expect(() =>
      resolveClientOptions(
        withOptions({
          auth: { method: "client_secret_basic", secret: "shh-secret" },
          metadata: { ...validMetadata(), token_endpoint_auth_methods_supported: ["none"] },
        }),
      ),
    ).toThrow("token_endpoint_auth_methods_supported");
  });

  it("accepts an auth method the provider advertises", () => {
    const resolved = resolveClientOptions(
      withOptions({
        auth: { method: "none" },
        metadata: { ...validMetadata(), token_endpoint_auth_methods_supported: ["none"] },
      }),
    );

    expect(resolved.auth.method).toBe("none");
  });

  it("does not check advertised methods when the provider lists none", () => {
    expect(resolveClientOptions(validOptions()).auth.method).toBe("none");
  });

  it.each(["timeout", "clockTolerance"])("throws TypeError for a non-integer %s", (name) => {
    expect(() => resolveClientOptions(withOptions({ [name]: 1.5 }))).toThrow(TypeError);
  });

  it.each([0, 61])("throws TypeError for a timeout of %s seconds", (timeout) => {
    expect(() => resolveClientOptions(withOptions({ timeout }))).toThrow("timeout");
  });

  it.each([-1, 301])("throws TypeError for a clockTolerance of %s seconds", (clockTolerance) => {
    expect(() => resolveClientOptions(withOptions({ clockTolerance }))).toThrow("clockTolerance");
  });

  it("throws TypeError when fetch is not a function", () => {
    expect(() => resolveClientOptions(withOptions({ fetch: "fetch" }))).toThrow("fetch");
  });

  it("throws TypeError when now is not a function", () => {
    expect(() => resolveClientOptions(withOptions({ now: Date.now() }))).toThrow("now");
  });
});
