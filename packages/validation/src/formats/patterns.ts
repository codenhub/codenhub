/** Dot-separated labels of letters, digits and hyphens, at most 253 characters, single labels included. */
export const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;

/**
 * An IPv4 address as four decimal parts from 0 to 255, without the leading zeros some parsers read as
 * octal. It is also the one form the URL parser writes, so a host in any other form is one it rewrites.
 */
export const IPV4_PATTERN =
  /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;

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
 * internationalized host. Marks are there for scripts that write them even in normalized text, such as
 * the vowel signs of Devanagari.
 */
const UNICODE_HOST_PATTERN = /^[\p{L}\p{M}\p{N}.-]+$/u;
/** A label in punycode, the ASCII form of an internationalized one. */
const PUNYCODE_LABEL_PATTERN = /(?:^|\.)xn--/i;
/** Any character past ASCII. */
const NON_ASCII_PATTERN = /[\u0080-\uffff]/;
/** The longest a domain name can be, in its ASCII form. */
export const HOST_MAX_LENGTH = 253;

/**
 * The ASCII form of a host that may be internationalized, as the URL parser writes it, so `münchen.de`
 * is `xn--mnchen-3ya.de`, or undefined when it is not a host at all, or not written in the normalized
 * form the parser reads it in. Text that is already ASCII is returned as it is, unless it holds a
 * punycode label that does not decode, such as `xn--zz`. Only letters, digits, hyphens and dots reach
 * the parser, so nothing in the text can turn it into a port, a path or another host.
 */
export function toAsciiHost(host: string): string | undefined {
  if (!NON_ASCII_PATTERN.test(host)) {
    // A punycode label must decode, which the parser checks and a pattern cannot: `xn--zz` is none.
    const isUndecodable =
      PUNYCODE_LABEL_PATTERN.test(host) && HOSTNAME_PATTERN.test(host) && !URL.canParse(`http://${host}`);
    return isUndecodable ? undefined : host;
  }
  // The parser maps a host through NFKC before encoding it, so a host that mapping changes, such as
  // fullwidth or decomposed letters, is a second spelling of another and would pass as a distinct string.
  if (!UNICODE_HOST_PATTERN.test(host) || host.normalize("NFKC") !== host || !URL.canParse(`http://${host}`)) {
    return undefined;
  }
  const { hostname } = new URL(`http://${host}`);
  return hostname.length <= HOST_MAX_LENGTH ? hostname : undefined;
}

/** A hostname whose last label is not all digits, since a name ending that way reads as an IPv4 address. */
export const isHostname = (text: string): boolean => HOSTNAME_PATTERN.test(text) && !/(?:^|\.)\d+$/.test(text);
