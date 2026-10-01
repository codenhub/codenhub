/** Dot-separated labels of letters, digits and hyphens, at most 253 characters, single labels included. */
export const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;

/**
 * An IPv4 address as four decimal parts from 0 to 255, without the leading zeros some parsers read as
 * octal.
 */
export const IPV4_PATTERN =
  /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;

/** A domain name with at least one dot and a real top-level domain. */
const DOMAIN_NAME_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/i;

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
 * Letters, combining marks and digits from any script, joined by hyphens and dots: what a domain is
 * written with. Marks are there for scripts that write them even in normalized text, such as the vowel
 * signs of Devanagari. The ideographic, fullwidth and halfwidth full stops are there because IDNA reads
 * them as dots, and `url` accepts them through the parser. None of these can end a host, so text of them
 * is read by the parser as a host and nothing else: never a port, a path, credentials or an escape.
 */
const DOMAIN_TEXT_PATTERN = /^[\p{L}\p{M}\p{N}.。．｡-]+$/u;
/** A label in punycode, the ASCII form of an internationalized one. */
const PUNYCODE_LABEL_PATTERN = /(?:^|\.)xn--/i;
/**
 * Tests whether every punycode label of a host decodes, which the URL parser checks and a pattern
 * cannot: `xn--zz` is no label. Call it only on text `HOSTNAME_PATTERN` accepts, so nothing but
 * letters, digits, hyphens and dots reaches the parser.
 */
const decodes = (host: string): boolean => !PUNYCODE_LABEL_PATTERN.test(host) || URL.canParse(`http://${host}`);
/** The longest a domain name can be, in its ASCII form. */
export const HOST_MAX_LENGTH = 253;

/**
 * A host as the URL parser reads it: lowercase ASCII, with an internationalized label in punycode, so
 * `München.de` is `xn--mnchen-3ya.de`, or undefined when the text is not a host at all. The parser's
 * reading is returned rather than the text, so every spelling it maps to one host, such as fullwidth
 * letters or an invisible variation selector, becomes that host, and no later check on the value can
 * see a different one.
 */
export function toAsciiHost(host: string): string | undefined {
  if (!DOMAIN_TEXT_PATTERN.test(host) || !URL.canParse(`http://${host}`)) {
    return undefined;
  }
  const { hostname } = new URL(`http://${host}`);
  return hostname.length <= HOST_MAX_LENGTH ? hostname : undefined;
}

/**
 * A last label the URL parser reads as a number, which makes the whole host an IPv4 address: decimal
 * digits, or `0x` and hex digits, none included, as in `0x7f000001` for `127.0.0.1`.
 */
const NUMERIC_LAST_LABEL_PATTERN = /(?:^|\.)(?:\d+|0x[0-9a-f]*)$/i;

/**
 * A hostname, without a final dot, whose last label is not one the URL parser reads as a number, since
 * a name ending that way is an IPv4 address. Its punycode is not tested: for a host the parser has
 * already read, it decodes.
 */
export const isNamedHost = (name: string): boolean =>
  HOSTNAME_PATTERN.test(name) && !NUMERIC_LAST_LABEL_PATTERN.test(name);

/**
 * A hostname whose last label is not one the URL parser reads as a number, since a name ending that
 * way is an IPv4 address, and whose punycode labels decode. An absolute name, ending in one dot, is the
 * same name, and its dot is not counted.
 */
export const isHostname = (text: string): boolean => {
  const name = text.endsWith(".") ? text.slice(0, -1) : text;
  return isNamedHost(name) && decodes(name);
};
