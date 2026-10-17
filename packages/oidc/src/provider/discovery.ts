import { exportPublicJwk, type Jwk } from "@codenhub/jwt";

import { deepFreeze } from "../shared/result";
import type { ProviderMetadata } from "../shared/types";
import type { ResolvedOptions } from "./options";

/**
 * Claims an ID token MAY carry, none released by any scope (OpenID Connect Core §2). `sub`, `iss`, `aud`,
 * `exp`, `iat`, `auth_time` and `at_hash` are always present; `nonce`, `acr` and `amr` are conditional.
 */
const ID_TOKEN_CLAIMS: readonly string[] = [
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
];

const TOKEN_ENDPOINT_AUTH_METHODS: readonly string[] = [
  "client_secret_basic",
  "client_secret_post",
  "client_secret_jwt",
  "private_key_jwt",
  "none",
];

/**
 * Algorithms a client may sign its token-endpoint authentication with (RFC 7523 §3, OpenID Connect Core
 * §9), published so a client picks one the provider accepts.
 */
const TOKEN_ENDPOINT_AUTH_SIGNING_ALGS: readonly string[] = ["ES256", "EdDSA", "Ed25519", "RS256", "PS256", "HS256"];

/** The members of a JWKS document (RFC 7517 §5). */
export interface JwksDocument {
  readonly keys: readonly Jwk[];
}

/** Returns the distinct values of `values`, in the order each first appears. */
const unique = <T>(values: Iterable<T>): T[] => [...new Set(values)];

/** The claim names the provider can release: the ID token's own claims, then every scope's claims. */
function listClaimsSupported(options: ResolvedOptions): string[] {
  const scopeClaims = [...options.scopeClaims.values()].flat();
  return unique([...ID_TOKEN_CLAIMS, ...scopeClaims]);
}

/** The signing algorithms of every published key, which is what a client may expect in an ID token. */
function listSigningAlgs(options: ResolvedOptions): string[] {
  return unique(options.publicKeys.map((key) => key.alg));
}

/**
 * Builds the OpenID Provider metadata this provider publishes at its discovery endpoint.
 *
 * @remarks
 * Every value comes from the resolved options, so the document cannot drift from what the endpoints
 * enforce. The flags for features this package does not implement (`claims` and `request` parameters, the
 * `subject_types` other than `public`) are published as unsupported, so a client never tries them.
 *
 * @param options - Validated provider options.
 * @returns A deep-frozen metadata document.
 */
export function buildMetadata(options: ResolvedOptions): ProviderMetadata {
  return deepFreeze({
    issuer: options.issuer,
    authorization_endpoint: options.endpoints.authorization,
    token_endpoint: options.endpoints.token,
    userinfo_endpoint: options.endpoints.userinfo,
    jwks_uri: options.endpoints.jwks,
    scopes_supported: [...options.scopeClaims.keys()],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: listSigningAlgs(options),
    token_endpoint_auth_methods_supported: TOKEN_ENDPOINT_AUTH_METHODS,
    token_endpoint_auth_signing_alg_values_supported: TOKEN_ENDPOINT_AUTH_SIGNING_ALGS,
    claims_supported: listClaimsSupported(options),
    code_challenge_methods_supported: ["S256"],
    revocation_endpoint: options.endpoints.revocation,
    revocation_endpoint_auth_methods_supported: TOKEN_ENDPOINT_AUTH_METHODS,
    revocation_endpoint_auth_signing_alg_values_supported: TOKEN_ENDPOINT_AUTH_SIGNING_ALGS,
    authorization_response_iss_parameter_supported: true,
    claims_parameter_supported: false,
    request_parameter_supported: false,
    request_uri_parameter_supported: false,
  });
}

/** Exports the public keys, and returns the frozen JWKS document holding them. */
async function exportJwks(options: ResolvedOptions): Promise<JwksDocument> {
  const keys = await Promise.all(options.publicKeys.map((key) => exportPublicJwk(key)));
  return deepFreeze({ keys });
}

/**
 * Creates the loader of the JWKS document, which exports the keys once and then serves the same object.
 *
 * @remarks
 * A failed export is not cached: the rejected promise is dropped, so the next request tries again instead
 * of answering with the failure for the life of the process.
 *
 * @param options - Validated provider options.
 * @returns A function that resolves the JWKS document.
 */
export function createJwksDocument(options: ResolvedOptions): () => Promise<JwksDocument> {
  let pending: Promise<JwksDocument> | undefined;
  const load = async (): Promise<JwksDocument> => {
    try {
      return await exportJwks(options);
    } catch (error) {
      pending = undefined;
      throw error;
    }
  };
  return () => {
    pending ??= load();
    return pending;
  };
}
