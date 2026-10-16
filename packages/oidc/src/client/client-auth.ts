import { type SigningKey, sign } from "@codenhub/jwt";

import { encodeBase64Url, randomToken } from "../shared/encoding";
import type { ResolvedClientOptions } from "./options";

/** The client assertion type of RFC 7523 §2.2, the only one a provider accepts. */
const CLIENT_ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

/** How long a client assertion is valid. It is used once, at the token endpoint, so a minute is ample. */
const ASSERTION_LIFETIME_SECONDS = 60;

const MILLISECONDS_PER_SECOND = 1000;

/** The space that `application/x-www-form-urlencoded` writes as `+`, which `encodeURIComponent` writes as `%20`. */
const ENCODED_SPACE = /%20/g;

const encoder = new TextEncoder();

/** Encodes one value of a form body or Basic credential (RFC 6749 §2.3.1), where a space is `+`. */
export function formEncode(value: string): string {
  return encodeURIComponent(value).replace(ENCODED_SPACE, "+");
}

/**
 * Encodes UTF-8 text as standard base64 (RFC 4648 §4), with `+`, `/` and `=` padding. Basic credentials
 * use this alphabet, not the URL-safe one, so the URL-safe encoder is mapped onto it.
 */
function toStandardBase64(text: string): string {
  const unpadded = encodeBase64Url(encoder.encode(text)).replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (unpadded.length % 4)) % 4;
  return unpadded + "=".repeat(padding);
}

/**
 * Signs the client assertion of `client_secret_jwt` and `private_key_jwt` (OpenID Connect Core §9). `aud`
 * is the issuer identifier, the audience the current recommendation names, so an assertion meant for one
 * provider cannot be replayed at another that happens to accept the same token endpoint URL.
 */
function signAssertion(options: ResolvedClientOptions, key: SigningKey): Promise<string> {
  const nowSeconds = Math.floor(options.now() / MILLISECONDS_PER_SECOND);
  return sign({
    payload: {
      iss: options.clientId,
      sub: options.clientId,
      aud: options.metadata.issuer,
      jti: randomToken(),
      iat: nowSeconds,
      exp: nowSeconds + ASSERTION_LIFETIME_SECONDS,
    },
    key,
  });
}

/**
 * Adds the client's credentials to a token request. Each method places them where the provider reads
 * them: Basic credentials in an `authorization` header, the others in the form body.
 *
 * @param options - The resolved client options, supplying the method, the secret or key, and the clock.
 * @param form - The token request's body. The credentials are added to it in place.
 * @returns The headers the request needs beyond its body. Empty for every method but `client_secret_basic`.
 * @throws Whatever `@codenhub/jwt` throws when signing a client assertion, which a key this package created
 * does not do.
 */
export async function authenticate(
  options: ResolvedClientOptions,
  form: URLSearchParams,
): Promise<Readonly<Record<string, string>>> {
  const { auth, clientId } = options;
  switch (auth.method) {
    case "none":
      form.set("client_id", clientId);
      return {};
    case "client_secret_basic": {
      // RFC 6749 §2.3.1: the id and secret are form-encoded before they are joined, so a `:` in either
      // cannot shift the boundary between them. The client id is not repeated in the body.
      const credentials = `${formEncode(clientId)}:${formEncode(auth.secret)}`;
      return { authorization: `Basic ${toStandardBase64(credentials)}` };
    }
    case "client_secret_post":
      form.set("client_id", clientId);
      form.set("client_secret", auth.secret);
      return {};
    case "client_secret_jwt":
    case "private_key_jwt":
      form.set("client_id", clientId);
      form.set("client_assertion_type", CLIENT_ASSERTION_TYPE);
      form.set("client_assertion", await signAssertion(options, auth.key));
      return {};
  }
}
