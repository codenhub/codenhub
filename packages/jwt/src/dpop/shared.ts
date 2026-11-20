import { encodeBase64Url } from "../encoding/base64url";
import { encodeUtf8 } from "../encoding/text";

/** The `typ` of a DPoP proof (RFC 9449 §4.2). */
export const DPOP_TYPE = "dpop+jwt";

/** RFC 9110 §5.6.2: a method is a token of these characters. */
const METHOD_TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export const isMethodToken = (value: unknown): value is string => typeof value === "string" && METHOD_TOKEN.test(value);

/**
 * The `htu` form of a URL: parsed by the WHATWG URL parser, which lowercases the scheme and host, drops a
 * default port and removes dot segments (RFC 3986 §6.2.2 and §6.2.3), then stripped of its query and fragment
 * (RFC 9449 §4.2 and §4.3). `undefined` for anything that is not an absolute `http:` or `https:` URL.
 */
export function normalizeHtu(value: string): string | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return undefined;
  }
  url.search = "";
  url.hash = "";
  return url.href;
}

/**
 * Reads a caller's URL, a string or a `URL` of any realm, as text. A `URL` is read through its own `href`, so
 * one from another realm, which `instanceof URL` would refuse, works the same.
 */
export function urlText(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object" && value !== null) {
    const href: unknown = (value as { href?: unknown }).href;
    return typeof href === "string" ? href : undefined;
  }
  return undefined;
}

/** RFC 9449 §4.2: `ath` is the base64url SHA-256 hash of the access token's ASCII bytes, unlike `at_hash` whole. */
export async function accessTokenHash(accessToken: string): Promise<string> {
  return encodeBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encodeUtf8(accessToken))));
}

export const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;
