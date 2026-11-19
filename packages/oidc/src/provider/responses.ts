import type { OAuthErrorCode } from "../shared/types";

/*
 * Responses of the endpoints a browser client may call from another origin: discovery, JWKS, token,
 * userinfo, and revocation. They allow any origin because none of them reads cookies or other ambient credentials: a
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

/**
 * `WWW-Authenticate` is not a CORS-safelisted response header, so a cross-origin page reads a challenge only when
 * the response names it here. Every response of the provider's own endpoints that carries a challenge also carries
 * CORS_HEADERS, so both go together. {@link resourceChallengeResponse} carries neither, since it answers for the app's
 * API, whose cross-origin policy is the app's.
 */
const CHALLENGE_EXPOSURE: Readonly<Record<string, string>> = {
  "access-control-expose-headers": "WWW-Authenticate",
};

/** Whether a header set carries a `WWW-Authenticate` challenge, whatever the letter case of its name. */
function carriesChallenge(headers: Readonly<Record<string, string>> | undefined): boolean {
  return Object.keys(headers ?? {}).some((name) => name.toLowerCase() === "www-authenticate");
}

/** Whether a response may be cached by the browser and intermediaries. */
export type Caching = "public" | "no-store";

/** A JSON response for a cross-origin endpoint. Token and userinfo responses must be `no-store`. */
export function jsonResponse(
  body: unknown,
  init: { readonly status?: number; readonly caching: Caching; readonly headers?: Readonly<Record<string, string>> },
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    // Caller headers come first so the helper's content type, CORS and caching headers always win.
    headers: {
      ...init.headers,
      "content-type": "application/json",
      ...CORS_HEADERS,
      ...(carriesChallenge(init.headers) ? CHALLENGE_EXPOSURE : {}),
      ...(init.caching === "no-store" ? NO_STORE_HEADERS : { "cache-control": "public, max-age=300" }),
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

/** The answer to a revocation request the provider accepted, whatever the token was (RFC 7009 §2.2). */
export function revocationResponse(): Response {
  return new Response(null, { status: 200, headers: { ...CORS_HEADERS, ...NO_STORE_HEADERS } });
}

/**
 * A bearer token challenge from the userinfo endpoint (RFC 6750 §3). Without `error`, it is the answer to
 * a request that carried no token at all, which §3.1 says gets no error code.
 */
export function bearerErrorResponse(error?: "invalid_request" | "invalid_token" | "insufficient_scope"): Response {
  const status = error === "invalid_request" ? 400 : error === "insufficient_scope" ? 403 : 401;
  const challenge = error === undefined ? "Bearer" : `Bearer error="${error}"`;
  return new Response(null, {
    status,
    headers: { ...CORS_HEADERS, ...CHALLENGE_EXPOSURE, ...NO_STORE_HEADERS, "www-authenticate": challenge },
  });
}

/**
 * A bearer token challenge from the app's own API (RFC 6750 §3), for {@link Provider.authenticate}. Unlike
 * {@link bearerErrorResponse} it carries no CORS headers, since the app owns its API's cross-origin policy. Without
 * `error`, it answers a request that carried no token (§3.1). `scope` names the scopes the API requires; each is a
 * scope token, which holds no quote or backslash, so it is written unescaped.
 */
export function resourceChallengeResponse(
  error?: "invalid_request" | "invalid_token" | "insufficient_scope",
  scopes?: readonly string[],
): Response {
  const status = error === "invalid_request" ? 400 : error === "insufficient_scope" ? 403 : 401;
  const attributes = [
    ...(error === undefined ? [] : [`error="${error}"`]),
    ...(scopes === undefined || scopes.length === 0 ? [] : [`scope="${scopes.join(" ")}"`]),
  ];
  const challenge = attributes.length === 0 ? "Bearer" : `Bearer ${attributes.join(", ")}`;
  return new Response(null, { status, headers: { ...NO_STORE_HEADERS, "www-authenticate": challenge } });
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
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(parameters)) {
    if (value !== undefined) {
      query.append(name, value);
    }
  }
  const search = query.toString();
  // A redirect URI never has a fragment (isRedirectUri rejects `#`), so the new parameters go at the end. The
  // registered URI is kept as it is: re-serializing it with URL would rewrite its query. The separator is `?`
  // when there is no query yet, nothing when the only `?` is the last character or the query ends with `&`,
  // and `&` otherwise. A URI ending in `??` has a query of `?`, so it takes `&`.
  const questionMark = redirectUri.indexOf("?");
  const separator =
    questionMark < 0 ? "?" : questionMark === redirectUri.length - 1 || redirectUri.endsWith("&") ? "" : "&";
  const location = search === "" ? redirectUri : `${redirectUri}${separator}${search}`;
  return new Response(null, { status: 302, headers: { location, "cache-control": "no-store" } });
}

/** The one script a form post page runs, which submits its form. The policy allows it by its hash alone. */
export const FORM_POST_SCRIPT = "document.forms[0].submit();";

/** The base64 SHA-256 of {@link FORM_POST_SCRIPT}, as `script-src` names it; a test checks it against the script. */
const FORM_POST_SCRIPT_HASH = "sha256-8lDeP0UDwCO6/RhblgeH/ctdBzjVpJxrXizsnIk3cEQ=";

/**
 * An origin `form-action` can name as written: a scheme, and for a URL with a host, `//`, a host of letters, digits,
 * dots, hyphens or an IPv6 literal, and a port. A registered redirect URI may hold a host the URL parser accepts
 * but a policy cannot, such as one with `;`, which would end the directive and start another.
 */
const POLICY_SOURCE = /^[a-z][a-z0-9+.-]*:(?:\/\/(?:[a-z0-9.-]+|\[[0-9a-f:.]+\])(?::\d+)?)?$/;

/** Escapes text for an HTML attribute value in double quotes, or for text content. */
const escapeHtml = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

/**
 * The `form-action` source of a redirect URI: its origin, or its scheme alone for a URL without a host, such as a
 * native app's `com.example.app:/callback`; `undefined` when the policy syntax cannot hold it.
 */
function formActionSource(redirectUri: string): string | undefined {
  const url = new URL(redirectUri);
  const source = url.host === "" ? url.protocol : `${url.protocol}//${url.host}`;
  return POLICY_SOURCE.test(source) ? source : undefined;
}

/**
 * The authorization response for `response_mode=form_post` (OAuth 2.0 Form Post Response Mode §2): a `200` HTML page
 * whose form the browser posts to the verified redirect URI, carrying the parameters as hidden fields.
 *
 * @remarks
 * This page is the one exception to "the provider never renders HTML": a protocol artifact with no text but a
 * `noscript` button, no styles and no app markup. Every value, the URI's own query included, is HTML-escaped. The
 * Content-Security-Policy allows no resource but its one script, by hash, limits the form's target to the redirect
 * URI's origin when the policy syntax can name it, and with `X-Frame-Options` forbids framing, so another site
 * cannot capture a code by embedding the page. It is never cached and sends no referrer.
 */
export function formPostResponse(
  redirectUri: string,
  parameters: Readonly<Record<string, string | undefined>>,
): Response {
  const fields = Object.entries(parameters)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join("");
  const html =
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Submit</title></head><body>' +
    `<form method="post" action="${escapeHtml(redirectUri)}">${fields}` +
    '<noscript><button type="submit">Continue</button></noscript></form>' +
    `<script>${FORM_POST_SCRIPT}</script></body></html>`;
  const formAction = formActionSource(redirectUri);
  const policy = [
    "default-src 'none'",
    `script-src '${FORM_POST_SCRIPT_HASH}'`,
    ...(formAction === undefined ? [] : [`form-action ${formAction}`]),
    "frame-ancestors 'none'",
    "base-uri 'none'",
  ].join("; ");
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": policy,
      "x-frame-options": "DENY",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      ...NO_STORE_HEADERS,
    },
  });
}
