import { generateKeyPair, type KeyPair } from "@codenhub/jwt";
import { describe, expect, it } from "vitest";

import { createMemoryStore } from "../testing/memory-store";
import { buildMetadata, createJwksDocument } from "./discovery";
import { type ResolvedOptions, resolveOptions } from "./options";
import type { ProviderOptions } from "./types";

const ISSUER = "https://op.example";
const NOW_MS = 1_800_000_000_000;

const CLAIMS_SUPPORTED = [
  "sub",
  "iss",
  "aud",
  "exp",
  "iat",
  "auth_time",
  "nonce",
  "acr",
  "amr",
  "at_hash",
  "name",
  "family_name",
  "given_name",
  "middle_name",
  "nickname",
  "preferred_username",
  "profile",
  "picture",
  "website",
  "gender",
  "birthdate",
  "zoneinfo",
  "locale",
  "updated_at",
  "email",
  "email_verified",
  "address",
  "phone_number",
  "phone_number_verified",
];

const resolve = (overrides: Partial<ProviderOptions>, keys: readonly KeyPair[]): ResolvedOptions =>
  resolveOptions({
    issuer: ISSUER,
    signingKeys: keys,
    store: createMemoryStore(),
    claims: () => ({}),
    now: () => NOW_MS,
    ...overrides,
  });

const keyPair = (kid: string, alg: "ES256" | "EdDSA" = "ES256"): Promise<KeyPair> => generateKeyPair({ alg, kid });

describe("buildMetadata", () => {
  it("shouldPublishTheExpectedMetadataForDefaultOptions", async () => {
    const options = resolve({}, [await keyPair("2026-10")]);

    expect(buildMetadata(options)).toEqual({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/authorize`,
      token_endpoint: `${ISSUER}/token`,
      userinfo_endpoint: `${ISSUER}/userinfo`,
      jwks_uri: `${ISSUER}/jwks`,
      scopes_supported: ["openid", "offline_access", "profile", "email", "address", "phone"],
      response_types_supported: ["code"],
      response_modes_supported: ["query"],
      grant_types_supported: ["authorization_code", "refresh_token", "client_credentials"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["ES256"],
      token_endpoint_auth_methods_supported: [
        "client_secret_basic",
        "client_secret_post",
        "client_secret_jwt",
        "private_key_jwt",
        "none",
      ],
      token_endpoint_auth_signing_alg_values_supported: ["ES256", "EdDSA", "Ed25519", "RS256", "PS256", "HS256"],
      claims_supported: CLAIMS_SUPPORTED,
      code_challenge_methods_supported: ["S256"],
      revocation_endpoint: `${ISSUER}/revoke`,
      end_session_endpoint: `${ISSUER}/logout`,
      revocation_endpoint_auth_methods_supported: [
        "client_secret_basic",
        "client_secret_post",
        "client_secret_jwt",
        "private_key_jwt",
        "none",
      ],
      revocation_endpoint_auth_signing_alg_values_supported: ["ES256", "EdDSA", "Ed25519", "RS256", "PS256", "HS256"],
      authorization_response_iss_parameter_supported: true,
      claims_parameter_supported: false,
      request_parameter_supported: false,
      request_uri_parameter_supported: false,
    });
  });

  it("shouldReturnADeepFrozenMetadataDocument", async () => {
    const metadata = buildMetadata(resolve({}, [await keyPair("2026-10")]));

    expect(Object.isFrozen(metadata)).toBe(true);
    expect(Object.isFrozen(metadata.scopes_supported)).toBe(true);
  });

  it("shouldAddCustomScopeToScopesSupported", async () => {
    const options = resolve({ scopes: { "read:orders": ["order_count"] } }, [await keyPair("2026-10")]);

    expect(buildMetadata(options).scopes_supported).toContain("read:orders");
  });

  it("shouldAddCustomScopeClaimsToClaimsSupported", async () => {
    const options = resolve({ scopes: { "read:orders": ["order_count"] } }, [await keyPair("2026-10")]);

    expect(buildMetadata(options).claims_supported).toContain("order_count");
  });

  it("shouldListEachClaimOnceWhenScopesShareIt", async () => {
    const options = resolve({ scopes: { work: ["email"] } }, [await keyPair("2026-10")]);
    const claims = buildMetadata(options).claims_supported ?? [];

    expect(claims.filter((claim) => claim === "email")).toHaveLength(1);
  });

  it("shouldListEachSigningAlgorithmOnceInKeyOrder", async () => {
    const options = resolve({}, [
      await keyPair("a", "EdDSA"),
      await keyPair("b", "ES256"),
      await keyPair("c", "EdDSA"),
    ]);

    expect(buildMetadata(options).id_token_signing_alg_values_supported).toEqual(["EdDSA", "ES256"]);
  });
});

describe("createJwksDocument", () => {
  it("shouldExportOneEntryPerKeyWithItsKidAndAlg", async () => {
    const options = resolve({}, [await keyPair("first"), await keyPair("second", "EdDSA")]);

    const document = await createJwksDocument(options)();

    expect(document.keys.map((key) => [key.kid, key.alg])).toEqual([
      ["first", "ES256"],
      ["second", "EdDSA"],
    ]);
  });

  it("shouldOmitPrivateMembersFromEveryKey", async () => {
    const options = resolve({}, [await keyPair("2026-10")]);

    const document = await createJwksDocument(options)();

    for (const key of document.keys) {
      expect(key).not.toHaveProperty("d");
    }
  });

  it("shouldReturnTheSameDocumentOnEveryCall", async () => {
    const jwks = createJwksDocument(resolve({}, [await keyPair("2026-10")]));

    expect(await jwks()).toBe(await jwks());
  });

  it("shouldRetryTheExportWhenThePreviousOneRejected", async () => {
    const good = await keyPair("2026-10");
    const bad = { kind: "public", alg: "ES256", kid: "2026-10" } as unknown as KeyPair["publicKey"];
    // Mutating the array between calls simulates a key that becomes valid after a transient failure.
    const publicKeys = [bad];
    const options = { ...resolve({}, [good]), publicKeys } as ResolvedOptions;
    const jwks = createJwksDocument(options);

    await expect(jwks()).rejects.toThrow(TypeError);
    publicKeys.splice(0, 1, good.publicKey);

    expect(await jwks()).toEqual({ keys: [expect.objectContaining({ kid: "2026-10" })] });
  });
});
