import { MAX_PARAMETER_LENGTH, MAX_URL_LENGTH } from "../shared/limits";
import { isRedirectUri } from "../shared/urls";
import { readOptionalString, readUiLocales } from "./authorize";
import type { ResolvedClientOptions } from "./options";
import type { EndSessionOptions } from "./types";

/**
 * Builds the URL that asks the provider to end the user's session (RP-Initiated Logout 1.0 §2). `client_id` is
 * always sent, so the provider can match `post_logout_redirect_uri` even when the ID token hint has expired.
 *
 * @throws {TypeError} When the metadata has no end_session_endpoint, an option is invalid, or the URL is longer
 * than the provider reads. The message names the option or the limit, never its value.
 */
export function buildEndSessionUrl(options: ResolvedClientOptions, request: EndSessionOptions = {}): string {
  if (typeof request !== "object" || request === null) {
    throw new TypeError("endSessionUrl: options must be an object");
  }
  const endpoint = options.metadata.end_session_endpoint;
  if (endpoint === undefined) {
    throw new TypeError("endSessionUrl: metadata has no end_session_endpoint");
  }
  const { postLogoutRedirectUri } = request;
  if (postLogoutRedirectUri !== undefined && !isRedirectUri(postLogoutRedirectUri)) {
    throw new TypeError(
      "endSessionUrl: postLogoutRedirectUri must be an absolute URI of visible ASCII, without fragment or credentials, and not javascript:, data:, vbscript: or file:",
    );
  }
  if (postLogoutRedirectUri !== undefined && postLogoutRedirectUri.length > MAX_PARAMETER_LENGTH) {
    throw new TypeError("endSessionUrl: postLogoutRedirectUri is longer than the provider accepts");
  }
  const parameters: [string, string | undefined][] = [
    ["id_token_hint", readOptionalString(request.idTokenHint, "endSessionUrl: idTokenHint")],
    ["logout_hint", readOptionalString(request.logoutHint, "endSessionUrl: logoutHint")],
    ["client_id", options.clientId],
    ["post_logout_redirect_uri", postLogoutRedirectUri],
    ["state", readOptionalString(request.state, "endSessionUrl: state")],
  ];
  const uiLocales = readUiLocales(request.uiLocales, "endSessionUrl");
  if (uiLocales.length > 0) {
    parameters.push(["ui_locales", uiLocales.join(" ")]);
  }
  const url = new URL(endpoint);
  for (const [name, value] of parameters) {
    // An empty value is dropped: the provider reads an empty parameter as absent (RFC 6749 §3.1).
    if (value !== undefined && value !== "") {
      url.searchParams.append(name, value);
    }
  }
  if (url.href.length > MAX_URL_LENGTH) {
    throw new TypeError(`endSessionUrl: the logout request URL is longer than ${MAX_URL_LENGTH} characters`);
  }
  return url.href;
}
