import type { Validator } from "../core/types";
import { isHostlessUrl } from "./hostless-url";
import { HOST_MAX_LENGTH, isPublicHost } from "./patterns";
import { textFormat } from "./text-format";

/**
 * Characters the URL parser strips or rewrites instead of rejecting: control characters, spaces and
 * backslashes. The value is returned as it came, so text holding them would pass as one URL and be
 * read as another, or carry a line break into a header.
 */
// oxlint-disable-next-line no-control-regex
const UNPARSED_CHARACTER_PATTERN = /[\u0000-\u0020\u007f\\]/;

/**
 * A scheme, exactly two slashes, then a non-empty authority as the parser keeps it. The parser supplies
 * missing slashes for http and https and skips extra ones, but against a base on the same scheme
 * "https:example.com" is a path. It also drops a userinfo ending in `@`, empty or not, and decodes a
 * `%` escape in the host, so neither can be in a host that is returned as it came. The authority is
 * captured, since the parser also maps it through NFKC, and one that mapping changes is a second
 * spelling of another host.
 */
const AUTHORITY_PATTERN = /^[^:]+:\/\/([^/?#@%]+)(?:[/?#]|$)/;

/** A URL scheme as RFC 3986 writes it, without its colon. */
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*$/i;

/** Options for {@link url}. */
export interface UrlOptions {
  /**
   * Accepted protocols, without the colon, in any letter case. Of the schemes without a host, `mailto`, `tel` and `urn`
   * are accepted, each checked by its own rules; any other is always rejected.
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
 * without embedded credentials. The value is not modified, and no scheme is guessed for input that
 * lacks one.
 *
 * @remarks
 * Text the URL parser would have to clean up is rejected rather than accepted as written:
 * surrounding or embedded whitespace, control characters such as line breaks, backslashes, a host
 * without both slashes before it, as in `https:example.com`, or with more than two, an `@` before the
 * host even with nothing in front of it, a percent-escape in the host, and a host not in the NFKC form
 * the parser reads it in, such as one with fullwidth or decomposed letters. A host longer than 253
 * characters is rejected too, with `allowLocal` as well.
 *
 * @example
 * ```ts
 * url()("https://example.com/a?b=1"); // { ok: true, value: "https://example.com/a?b=1" }
 * url()("http://localhost:3000"); // { ok: false, ... }
 * url({ allowLocal: true })("http://localhost:3000"); // { ok: true, ... }
 * ```
 *
 * @param options - Accepted protocols, and whether local hosts are allowed.
 * @returns A validator that produces the URL as a string.
 * @throws {TypeError} When a protocol is not a scheme name, for instance `"https:"` with its colon.
 */
export function url(options: UrlOptions = {}): Validator<string> {
  const protocols = (options.protocols ?? ["http", "https"]).map((protocol) => {
    if (!SCHEME_PATTERN.test(protocol)) {
      throw new TypeError(`Protocols are scheme names without the colon, such as "https", received "${protocol}"`);
    }
    return protocol.toLowerCase();
  });
  const allowLocal = options.allowLocal ?? false;
  return textFormat("url", (text) => {
    if (UNPARSED_CHARACTER_PATTERN.test(text) || !URL.canParse(text)) {
      return false;
    }
    const parsed = new URL(text);
    const scheme = parsed.protocol.slice(0, -1);
    if (!protocols.includes(scheme)) {
      return false;
    }
    if (parsed.host === "") {
      return isHostlessUrl(scheme, text.slice(parsed.protocol.length), allowLocal);
    }
    const authority = AUTHORITY_PATTERN.exec(text)?.[1];
    return (
      authority !== undefined &&
      authority.normalize("NFKC") === authority &&
      parsed.hostname.length <= HOST_MAX_LENGTH &&
      (allowLocal || isPublicHost(parsed.hostname))
    );
  });
}
