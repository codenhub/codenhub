import type { OAuthErrorCode } from "../shared/types";

/*
 * Responses of the endpoints a browser client may call from another origin: discovery, JWKS, token, and
 * userinfo. They allow any origin because none of them reads cookies or other ambient credentials: a
 * request is authorized only by what it carries itself, so a cross-origin page gains nothing it could
 * not send from a server. The authorization endpoint answers top-level navigations only and never gets
 * these headers.
 */
const CORS_HEADERS: Readonly<Record<string, string>> = {
  "access-control-allow-origin": "*",
};

const NO_STORE_HEADERS: Readonly<Record<string, string>> = {
  "cache-control": "no-store",
  pragma: "no-cache",
};

/** Whether a response may be cached by the browser and intermediaries. */
export type Caching = "public" | "no-store";

/** A JSON response for a cross-origin endpoint. Token and userinfo responses must be `no-store`. */
export function jsonResponse(
  body: unknown,
  init: { readonly status?: number; readonly caching: Caching; readonly headers?: Readonly<Record<string, string>> },
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...CORS_HEADERS,
      ...(init.caching === "no-store" ? NO_STORE_HEADERS : { "cache-control": "public, max-age=300" }),
      ...init.headers,
    },
  });
}

/**
 * An OAuth error response from the token endpoint (RFC 6749 §5.2). It never carries `error_description`:
 * a generic code tells an attacker nothing, and a description is where input values tend to leak.
 */
export function tokenErrorResponse(error: OAuthErrorCode, headers?: Readonly<Record<string, string>>): Response {
  const status = error === "invalid_client" ? 401 : error === "server_error" ? 500 : 400;
  return jsonResponse({ error }, { status, caching: "no-store", headers });
}

/**
 * A bearer token challenge from the userinfo endpoint (RFC 6750 §3). Without `error`, it is the answer to
 * a request that carried no token at all, which §3.1 says gets no error code.
 */
export function bearerErrorResponse(error?: "invalid_request" | "invalid_token"): Response {
  const status = error === "invalid_request" ? 400 : 401;
  const challenge = error === undefined ? "Bearer" : `Bearer error="${error}"`;
  return new Response(null, {
    status,
    headers: { ...CORS_HEADERS, ...NO_STORE_HEADERS, "www-authenticate": challenge },
  });
}

/** `405` for a method an endpoint does not accept. */
export function methodNotAllowed(allow: readonly string[]): Response {
  return new Response(null, { status: 405, headers: { ...CORS_HEADERS, allow: allow.join(", ") } });
}

/** The answer to a CORS preflight for a cross-origin endpoint. */
export function preflightResponse(methods: readonly string[]): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...CORS_HEADERS,
      "access-control-allow-methods": methods.join(", "),
      "access-control-allow-headers": "authorization, content-type",
      "access-control-max-age": "600",
    },
  });
}

/**
 * A `302` to a redirect URI the provider has verified for the client, with the authorization response
 * parameters added to its query (RFC 6749 §4.1.2). Existing query parameters are kept, as §3.1.2 requires.
 */
export function redirectResponse(
  redirectUri: string,
  parameters: Readonly<Record<string, string | undefined>>,
): Response {
  const location = new URL(redirectUri);
  for (const [name, value] of Object.entries(parameters)) {
    if (value !== undefined) {
      location.searchParams.append(name, value);
    }
  }
  return new Response(null, { status: 302, headers: { location: location.href, "cache-control": "no-store" } });
}
