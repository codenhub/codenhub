import type { Validator } from "../core/types";
import { HOSTLESS_SCHEMES, toHostlessUrl } from "./hostless-url";
import { HOST_MAX_LENGTH, isPublicHost } from "./patterns";
import { canonicalFormat } from "./text-format";

/**
 * Visible characters only: a written URL holds no whitespace and no control characters (RFC 3986). The
 * parser would drop or encode them without a word, so text holding them is not taken for a URL.
 */
const WRITTEN_URL_PATTERN = /^[^\s\p{Cc}]+$/u;

/** A URL scheme as RFC 3986 writes it, without its colon. */
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*$/i;

/**
 * Schemes whose URLs run script when followed. Written with a host, such as
 * `javascript://example.com/%0aalert(1)`, one passes every host check and still runs, so none is ever
 * safe to accept.
 */
const SCRIPT_SCHEMES = ["javascript", "vbscript", "data"];

/** Options for {@link url}. */
export interface UrlOptions {
  /**
   * Accepted protocols, without the colon, in any letter case. Of the schemes without a host, `mailto`, `tel` and `urn`
   * are accepted, each checked by its own rules even when written with a host; any other is always rejected. `javascript`, `vbscript`
   * and `data` cannot be listed, since their URLs run script.
   *
   * @defaultValue ["http", "https"]
   */
  protocols?: readonly string[];
  /**
   * Accepts hosts that are not public domain names: `localhost`, single-label hosts, every IP address,
   * public ones included and with no check of ranges, and special-use names such as `app.localhost`,
   * `db.internal` or `printer.local`. It means "any host", not "only private ones".
   *
   * @defaultValue false
   */
  allowLocal?: boolean;
}

/**
 * Creates a validator for absolute URLs with an allowed protocol and a public domain name, and
 * without embedded credentials. The value is the URL as the URL parser writes it, which is what a
 * request made with it will use.
 *
 * @remarks
 * The text is read by the standard URL parser, and every check is made on what it read: the scheme, the
 * credentials and the host. The value is that reading, serialized, so a check made later on the value
 * sees the URL a request will reach: `https://Example.com/a/../b` is `https://example.com/b`, a host
 * spelled with fullwidth letters or invisible characters is the host they spell, an internationalized
 * host is in punycode, an IPv4 host is four decimal parts, and characters such as `"` and `<` are
 * percent-encoded. A `mailto` URL gives each recipient as `email` does. Text holding whitespace or control characters is rejected rather than cleaned, and
 * no scheme is guessed for text that lacks one. A host longer than 253 characters is rejected, with
 * `allowLocal` as well.
 *
 * @example
 * ```ts
 * url()("https://Example.com/a?b=1"); // { ok: true, value: "https://example.com/a?b=1" }
 * url()("http://localhost:3000"); // { ok: false, ... }
 * url({ allowLocal: true })("http://localhost:3000"); // { ok: true, value: "http://localhost:3000/" }
 * ```
 *
 * @param options - Accepted protocols, and whether local hosts are allowed.
 * @returns A validator that produces the URL as the parser writes it.
 * @throws {TypeError} When a protocol is not a scheme name, for instance `"https:"` with its colon, or is
 * `javascript`, `vbscript` or `data`, whose URLs run script.
 */
export function url(options: UrlOptions = {}): Validator<string> {
  const protocols = (options.protocols ?? ["http", "https"]).map((protocol) => {
    if (!SCHEME_PATTERN.test(protocol)) {
      throw new TypeError(`Protocols are scheme names without the colon, such as "https", received "${protocol}"`);
    }
    const scheme = protocol.toLowerCase();
    if (SCRIPT_SCHEMES.includes(scheme)) {
      throw new TypeError(`${scheme} URLs can run script and cannot be accepted`);
    }
    return scheme;
  });
  const allowLocal = options.allowLocal ?? false;
  return canonicalFormat("url", (text) => {
    if (!WRITTEN_URL_PATTERN.test(text) || !URL.canParse(text)) {
      return undefined;
    }
    const parsed = new URL(text);
    const scheme = parsed.protocol.slice(0, -1);
    if (!protocols.includes(scheme) || parsed.username !== "" || parsed.password !== "") {
      return undefined;
    }
    if (parsed.host === "" || HOSTLESS_SCHEMES.includes(scheme)) {
      const rest = toHostlessUrl(scheme, parsed.href.slice(parsed.protocol.length), allowLocal);
      return rest === undefined ? undefined : `${parsed.protocol}${rest}`;
    }
    return parsed.hostname.length <= HOST_MAX_LENGTH && (allowLocal || isPublicHost(parsed.hostname))
      ? parsed.href
      : undefined;
  });
}
