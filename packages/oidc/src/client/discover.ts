import type { OidcResult, ProviderMetadata } from "../shared/types";
import { isHttpsUrl } from "../shared/urls";
import { requestFailure, requestJson } from "./http";
import { checkMetadata } from "./metadata";
import { readTimeoutSeconds } from "./options";
import type { DiscoverOptions } from "./types";

const WELL_KNOWN_PATH = "/.well-known/openid-configuration";
const HTTP_OK = 200;
const MILLISECONDS_PER_SECOND = 1000;

/**
 * Builds the discovery URL: the issuer, without a trailing slash, plus the well-known path (OpenID Connect
 * Discovery 1.0 §4.1). An issuer with a path keeps that path.
 */
function discoveryUrl(issuer: string): string {
  if (!isHttpsUrl(issuer) || issuer.includes("?")) {
    throw new TypeError("discover: issuer must be an https URL without query or fragment");
  }
  const base = issuer.endsWith("/") ? issuer.slice(0, -1) : issuer;
  return `${base}${WELL_KNOWN_PATH}`;
}

/** Checks the options object and returns the fetch and timeout, with defaults applied. */
function readDiscoverOptions(options: DiscoverOptions | undefined): {
  readonly fetch: typeof fetch | undefined;
  readonly timeout: number;
} {
  if (options === undefined) {
    return { fetch: undefined, timeout: readTimeoutSeconds(undefined, "discover: timeout") };
  }
  if (typeof options !== "object" || options === null) {
    throw new TypeError("discover: options must be an object");
  }
  if (options.fetch !== undefined && typeof options.fetch !== "function") {
    throw new TypeError("discover: fetch must be a function");
  }
  return { fetch: options.fetch, timeout: readTimeoutSeconds(options.timeout, "discover: timeout") };
}

/**
 * Fetches a provider's discovery document and checks it, so a client can be created from the issuer alone.
 *
 * @remarks
 * The document is requested at `{issuer}/.well-known/openid-configuration`, with redirects not followed,
 * a response bound of 64 KiB, and the timeout applied to the whole request. Its `issuer` member must equal
 * the issuer given here, byte for byte, so a document served for another issuer is refused.
 *
 * Failures of the network, the response, or the document come back as results and never throw, so a
 * provider that is down or misconfigured is an ordinary outcome. Only a bad argument throws.
 *
 * @param issuer - The provider's issuer identifier, an `https` URL with no query or fragment. A trailing
 * slash is removed before the well-known path is added.
 * @param options - The `fetch` and `timeout` to use. Omit it for the global `fetch` and a 5-second timeout.
 * @returns The frozen metadata, or every issue found. The failures are:
 * - `request_failed` with `params.reason` of `timeout`, `network`, `status` (with `params.status`, for any
 *   response other than `200`, including redirects), `content_type` (a `200` that is not JSON),
 *   `too_large`, or `malformed` (a body that is not a JSON object).
 * - `issuer_mismatch` when the document's `issuer` is not the given issuer.
 * - `invalid_metadata` for each member that is missing or invalid, with its path, such as
 *   `["metadata", "jwks_uri"]`. Every such issue is collected in one result.
 *
 * @throws {TypeError} When `issuer` is not an `https` URL or has a query, when `options` is not an object,
 * when `options.fetch` is not a function, or when `options.timeout` is not an integer from 1 through 60.
 *
 * @example
 * ```ts
 * import { discover } from "@codenhub/oidc/client";
 *
 * const result = await discover("https://login.example.com");
 * if (!result.ok) {
 *   for (const issue of result.error.issues) console.error(issue.code, issue.path);
 * } else {
 *   console.log(result.value.authorization_endpoint);
 * }
 * ```
 */
export async function discover(issuer: string, options?: DiscoverOptions): Promise<OidcResult<ProviderMetadata>> {
  const url = discoveryUrl(issuer);
  const { fetch, timeout } = readDiscoverOptions(options);
  const response = await requestJson({
    endpoint: "discovery",
    url,
    method: "GET",
    fetch,
    timeoutMs: timeout * MILLISECONDS_PER_SECOND,
  });
  if (!response.ok) {
    return response;
  }
  if (response.value.status !== HTTP_OK) {
    return requestFailure("discovery", "status", response.value.status);
  }
  return checkMetadata(response.value.body, issuer);
}
