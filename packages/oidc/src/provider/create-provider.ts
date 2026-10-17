import type { ProviderMetadata } from "../shared/types";
import { beginAuthorization, completeAuthorization } from "./authorization";
import { buildMetadata, createJwksDocument, type JwksDocument } from "./discovery";
import { type ResolvedEndpoints, type ResolvedOptions, resolveOptions } from "./options";
import { jsonResponse, methodNotAllowed, preflightResponse } from "./responses";
import { handleRevocation } from "./revocation";
import { handleToken } from "./token";
import type { AuthorizationDenial, AuthorizationGrant, Provider, ProviderOptions } from "./types";
import { handleUserinfo } from "./userinfo";

/** The endpoints this provider answers itself. The authorization endpoint is not one of them. */
type EndpointRoute = "discovery" | "jwks" | "token" | "userinfo" | "revocation";

/** Everything a request needs to be answered, built once when the provider is created. */
interface ProviderContext {
  readonly options: ResolvedOptions;
  readonly routes: ReadonlyMap<string, EndpointRoute>;
  readonly metadata: ProviderMetadata;
  readonly loadJwks: () => Promise<JwksDocument>;
}

/**
 * Identifies an endpoint by origin and path. The query and fragment are left out on purpose: a client may
 * append parameters to the discovery URL, and they do not change which endpoint it names.
 */
const endpointKey = (url: URL): string => url.origin + url.pathname;

/** Parses each endpoint once, so answering a request compares strings instead of parsing URLs. */
function buildRoutes(endpoints: ResolvedEndpoints): ReadonlyMap<string, EndpointRoute> {
  return new Map<string, EndpointRoute>([
    [endpointKey(new URL(endpoints.discovery)), "discovery"],
    [endpointKey(new URL(endpoints.jwks)), "jwks"],
    [endpointKey(new URL(endpoints.token)), "token"],
    [endpointKey(new URL(endpoints.userinfo)), "userinfo"],
    [endpointKey(new URL(endpoints.revocation)), "revocation"],
  ]);
}

/** The route a request URL names, or `undefined` when it names none. A malformed URL names none. */
function routeFor(routes: ReadonlyMap<string, EndpointRoute>, rawUrl: string): EndpointRoute | undefined {
  try {
    return routes.get(endpointKey(new URL(rawUrl)));
  } catch {
    return undefined;
  }
}

/**
 * Answers a GET-only public document, such as discovery or JWKS. Both are public data, so they may be
 * cached by anyone.
 */
async function answerDocument(request: Request, load: () => unknown): Promise<Response> {
  if (request.method === "OPTIONS") {
    return preflightResponse(["GET"]);
  }
  if (request.method !== "GET") {
    return methodNotAllowed(["GET", "OPTIONS"]);
  }
  return jsonResponse(await load(), { caching: "public" });
}

/** Routes a request to its endpoint, or returns `null` when the request is for none of them. */
async function answerRequest(context: ProviderContext, request: Request): Promise<Response | null> {
  switch (routeFor(context.routes, request.url)) {
    case "discovery":
      return answerDocument(request, () => context.metadata);
    case "jwks":
      return answerDocument(request, context.loadJwks);
    case "token":
      return handleToken(context.options, request);
    case "userinfo":
      return handleUserinfo(context.options, request);
    case "revocation":
      return handleRevocation(context.options, request);
    default:
      return null;
  }
}

/**
 * Creates an OpenID Provider from its options, ready to answer requests on the Fetch API.
 *
 * @remarks
 * The provider answers the discovery, JWKS, token, userinfo, and revocation endpoints through {@link Provider.handle},
 * and runs the authorization flow through {@link Provider.beginAuthorization} and
 * {@link Provider.completeAuthorization}. The authorization endpoint itself is not routed, so the app
 * serves it and calls `beginAuthorization` from its own handler. Options are validated here, once, so a
 * misconfiguration fails at startup instead of on the first request. Key pairs are checked for shape,
 * algorithm and `kid` only: not that the two halves match, nor that the keys come from this package's
 * `@codenhub/jwt` copy.
 *
 * @param options - The issuer, signing keys, store, claims callback, and optional scopes, lifetimes, and
 * endpoints.
 * @returns A frozen provider. Its `metadata` is the discovery document it publishes.
 * @throws {TypeError} When an option is invalid, such as a non-`https` issuer, a store missing a method, two
 * signing keys with the same `kid`, or a lifetime outside its range. The message names the option, never
 * its value.
 * @example
 * ```ts
 * import { generateKeyPair } from "@codenhub/jwt";
 * import { createProvider, type OidcStore } from "@codenhub/oidc/provider";
 *
 * declare const store: OidcStore; // the app's database adapter
 * declare function lookupEmail(subject: string): Promise<string>;
 *
 * export async function createSsoProvider() {
 *   return createProvider({
 *     issuer: "https://sso.example",
 *     signingKeys: [await generateKeyPair({ alg: "ES256", kid: "2026-10" })],
 *     store,
 *     claims: async ({ subject }) => ({ email: await lookupEmail(subject) }),
 *     scopes: { "read:orders": ["order_count"] },
 *   });
 * }
 * ```
 */
export function createProvider(options: ProviderOptions): Provider {
  const resolved = resolveOptions(options);
  const context: ProviderContext = {
    options: resolved,
    routes: buildRoutes(resolved.endpoints),
    metadata: buildMetadata(resolved),
    loadJwks: createJwksDocument(resolved),
  };
  return Object.freeze({
    metadata: context.metadata,
    handle: (request: Request) => answerRequest(context, request),
    beginAuthorization: (request: Request) => beginAuthorization(resolved, request),
    completeAuthorization: (interactionId: string, outcome: AuthorizationGrant | AuthorizationDenial) =>
      completeAuthorization(resolved, interactionId, outcome),
  });
}
