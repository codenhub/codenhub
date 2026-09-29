/** Dot-separated labels of letters, digits and hyphens, at most 253 characters, single labels included. */
export const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;

/** A domain name with at least one dot and a real top-level domain. */
const DOMAIN_NAME_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,}|xn--[a-z0-9-]{1,59})$/i;

/**
 * Special-use names that look like domain names but never name a public host: `localhost`, `local`,
 * `internal` and `home.arpa` resolve on the local network or machine, and the rest are reserved for
 * testing, documentation or other networks (RFC 6761, 6762, 7686, 8375 and 9476, and ICANN's
 * `.internal`).
 */
const SPECIAL_USE_NAME_PATTERN = /(?:^|\.)(?:localhost|local|internal|test|example|invalid|alt|onion|home\.arpa)$/i;

/** Tests whether a host is a public domain name, which is what "public" means for email and URL hosts. */
export const isPublicHost = (host: string): boolean =>
  DOMAIN_NAME_PATTERN.test(host) && !SPECIAL_USE_NAME_PATTERN.test(host);

/**
 * Letters, combining marks and digits from any script, joined by hyphens and dots: what can be an
 * internationalized host. Marks are there because `ü` is also written as `u` and a combining diaeresis.
 */
const UNICODE_HOST_PATTERN = /^[\p{L}\p{M}\p{N}.-]+$/u;
/** Any character past ASCII. */
const NON_ASCII_PATTERN = /[\u0080-\uffff]/;
const HOST_MAX_LENGTH = 253;

/**
 * The ASCII form of a host that may be internationalized, as the URL parser writes it, so `münchen.de`
 * is `xn--mnchen-3ya.de`, or undefined when it is not a host at all. Text that is already ASCII is
 * returned as it is. Only letters, digits, hyphens and dots reach the parser, so nothing in the text
 * can turn it into a port, a path or another host.
 */
export function toAsciiHost(host: string): string | undefined {
  if (!NON_ASCII_PATTERN.test(host)) {
    return host;
  }
  if (!UNICODE_HOST_PATTERN.test(host) || !URL.canParse(`http://${host}`)) {
    return undefined;
  }
  const { hostname } = new URL(`http://${host}`);
  return hostname.length <= HOST_MAX_LENGTH ? hostname : undefined;
}

/** A hostname whose last label is not all digits, since a name ending that way reads as an IPv4 address. */
export const isHostname = (text: string): boolean => HOSTNAME_PATTERN.test(text) && !/(?:^|\.)\d+$/.test(text);
