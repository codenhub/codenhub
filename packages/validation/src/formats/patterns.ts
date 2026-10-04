import { isBidiHost } from "./bidi";
import { isPunycodeHost } from "./punycode";

/** Dot-separated labels of letters, digits and hyphens, at most 253 characters, single labels included. */
export const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;

/**
 * An IPv4 address as four decimal parts from 0 to 255, without the leading zeros some parsers read as
 * octal.
 */
export const IPV4_PATTERN =
  /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;

/** A domain name with at least one dot and a last label of 2 to 63 letters or a punycode label. */
const DOMAIN_NAME_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/i;

/**
 * Special-use names that look like domain names but never name a public host: `localhost`, `local`,
 * `internal` and `home.arpa` resolve on the local network or machine, the rest of `.arpa` holds the
 * infrastructure of the DNS itself, such as the reverse names in `in-addr.arpa`, and the rest are reserved
 * for testing, documentation or other networks (RFC 3172, 6761, 6762, 7686, 8375 and 9476, and ICANN's
 * `.internal`). `home`, `corp` and `mail` are the names ICANN resolved in 2018 never to delegate, since
 * private networks already use them, and `localdomain` is the name many systems give the local machine,
 * as in `localhost.localdomain`. `svc` and `cluster` end the names Kubernetes gives services inside a
 * cluster, such as `kubernetes.default.svc`, a known target for requests forged to reach inside it. The
 * list also holds the eleven IDN test top-level domains IANA listed, in their ASCII form: `إختبار`,
 * `آزمایشی`, `测试`, `測試`, `испытание`, `परीक्षा`, `δοκιμή`, `테스트`, `טעסט`, `テスト` and `பரிட்சை`.
 */
const SPECIAL_USE_NAME_PATTERN =
  /(?:^|\.)(?:localhost|localdomain|local|internal|home|corp|mail|svc|cluster|test|example|invalid|alt|onion|arpa|xn--(?:kgbechtv|hgbk6aj7f53bba|0zwm56d|g6w251d|80akhbyknj4f|11b5bs3a9aj6g|jxalpdlp|9t4b11yi5a|deba0ad|zckzah|hlcj6aya9esc7a))$/i;

/** A label in punycode, the ASCII form of an internationalized one. */
const PUNYCODE_LABEL_PATTERN = /(?:^|\.)xn--/i;

/**
 * Tests the internationalized labels of an ASCII host as every browser does: each `xn--` label decodes
 * to the label it spells, and the host keeps the bidi rule. Not every parser checks either, so it is
 * checked here, for a host the parser has already read too. A host with no `xn--` label has nothing to
 * check, which is most of them, so they pay one test. `url` applies it whatever its host validator, so
 * a host validator replaces the rule of which hosts are public, never the rule that every runtime reads
 * the host the same.
 */
export const isIdnHost = (host: string): boolean =>
  !PUNYCODE_LABEL_PATTERN.test(host) || (isPunycodeHost(host) && isBidiHost(host));

/**
 * Tests whether a host is a public domain name, which is what "public" means for email and URL hosts,
 * its internationalized labels included. An absolute name, ending in a dot, is not one: `example.com.`
 * names the same host as `example.com`, and a second spelling of one host would let it past a check that
 * compares the value as a string, such as a list of blocked hosts.
 */
export const isPublicHost = (host: string): boolean =>
  DOMAIN_NAME_PATTERN.test(host) && !SPECIAL_USE_NAME_PATTERN.test(host) && isIdnHost(host);

/**
 * Letters, combining marks and digits from any script, joined by hyphens and dots: what a domain is
 * written with. Marks are there for scripts that write them even in normalized text, such as the vowel
 * signs of Devanagari. The ideographic, fullwidth and halfwidth full stops are there because IDNA reads
 * them as dots, and `url` accepts them through the parser. None of these can end a host, so text of them
 * is read by the parser as a host and nothing else: never a port, a path, credentials or an escape.
 */
const DOMAIN_TEXT_PATTERN = /^[\p{L}\p{M}\p{N}.。．｡-]+$/u;
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
 * A hostname whose last label is not one the URL parser reads as a number, since a name ending that
 * way is an IPv4 address, and whose internationalized labels are valid in every browser. An absolute
 * name, ending in a dot, is not one, as {@link isPublicHost} says.
 */
export const isHostname = (name: string): boolean =>
  HOSTNAME_PATTERN.test(name) && !NUMERIC_LAST_LABEL_PATTERN.test(name) && isIdnHost(name);
