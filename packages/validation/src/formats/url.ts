import { split } from "../core/checks";
import { assertOption, issue } from "../core/result";
import type {
  AnyValidator,
  AsyncCheck,
  AsyncValidator,
  Check,
  Composed,
  MessageOptions,
  Validator,
} from "../core/types";
import { HOSTLESS_SCHEMES, toHostlessUrl } from "./hostless-url";
import { toCanonicalIpv6 } from "./ip";
import { assertParts, notFormat, partIssue, partsFormat, readQuery, type Part, type Reading } from "./parts";
import { HOST_MAX_LENGTH, HOST_TEXT_MAX_LENGTH, isIdnHost, isPublicHost } from "./patterns";

/**
 * No whitespace and no control characters: a written URL holds neither (RFC 3986), and the parser would
 * drop or encode them without a word, so text holding them is not taken for a URL. Invisible format
 * characters, such as a zero-width space, are left to the parser, which drops them from a host and
 * percent-encodes them elsewhere, and the value is what it read.
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

/** The schemes the URL Standard gives rules for a host, which parsers apply differently to unusual text. */
const SPECIAL_SCHEMES = ["ftp", "file", "http", "https", "ws", "wss"];

/**
 * A host every parser reads alike: labels of lowercase ASCII letters, digits, hyphens and underscores,
 * none empty. Node.js reads `ㅤ.com`, whose Hangul filler IDNA
 * drops, as `.com`, which WebKit refuses.
 */
const PLAIN_HOST_PATTERN = /^[a-z\d_-]+(?:\.[a-z\d_-]+)*$/;

/**
 * The host as a URL of a special scheme writes it: after the slashes, which may be backslashes, and any
 * credentials, up to the port, path, query or fragment. An IPv6 address keeps its brackets.
 */
const WRITTEN_HOST_PATTERN = /^[^:]+:[/\\]*(?:[^/\\?#]*@)?(\[[^\]]*\]|[^/\\?#:]*)/;

/** An IPv4 address as the parser writes one, four decimal parts. */
const DOTTED_IPV4_PATTERN = /^\d+\.\d+\.\d+\.\d+$/;

/**
 * An IPv6 address as written in a URL that every parser reads alike: hex groups and colons, and an IPv4
 * tail in decimal parts without a leading zero, which Chromium reads and Node.js refuses. The parser has
 * already read the address, so only how it was spelled is left to check.
 */
const WRITTEN_IPV6_PATTERN =
  /^\[[\da-f:]*(?::(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))?\]$/i;

/** A part of a host written as `0x` with no digit, which some parsers read as 0 and Firefox refuses. */
const BARE_HEX_PATTERN = /(?:^|\.)0x(?:\.|$)/i;

/**
 * Tests whether a host a special scheme's URL was read with is one every runtime reads alike, for a URL
 * whose host a host validator decides: a name of plain characters, an IPv4 address not written with a bare
 * `0x` part, or an IPv6 address spelled as every parser reads it. Chromium writes `a*b.com` as `a%2Ab.com` and
 * Firefox refuses it, and Chromium reads `[::01.2.3.4]` and `a%20.com`, which Node.js refuses.
 */
function isPlainHost(text: string, hostname: string): boolean {
  const written = WRITTEN_HOST_PATTERN.exec(text)?.[1] ?? "";
  if (hostname.startsWith("[")) {
    return WRITTEN_IPV6_PATTERN.test(written);
  }
  return PLAIN_HOST_PATTERN.test(hostname) && !(DOTTED_IPV4_PATTERN.test(hostname) && BARE_HEX_PATTERN.test(written));
}

/**
 * Tests whether a URL of a scheme the parser has rules for writes a host longer than a host is ever
 * written. The parser reads the host of such a scheme as a domain name, and decodes a punycode label in
 * time that grows with the square of its length, so the text is measured before the parser is given it.
 * A host of any other scheme is kept as written, which takes no such time.
 */
const hasOverlongHost = (text: string): boolean =>
  SPECIAL_SCHEMES.includes(text.slice(0, text.indexOf(":")).toLowerCase()) &&
  (WRITTEN_HOST_PATTERN.exec(text)?.[1] ?? "").length > HOST_TEXT_MAX_LENGTH;

/** A percent-encoded path separator, `%2F` for `/` or `%5C` for `\`, in either letter case. */
const ENCODED_SEPARATOR_PATTERN = /%(?:2f|5c)/i;

/**
 * A segment that is `.` or `..`, a dot written plain or as `%2E`, followed by `;` and its parameters, as in
 * `/api/..;/admin`, or by `%3B`, the `;` a proxy that decodes the path, such as nginx, passes on as one.
 * The parser reads it as an ordinary segment, while a server that drops the parameters before resolving
 * dot segments, as Tomcat and Jetty do, reads `..`.
 */
const DOT_SEGMENT_PATTERN = /(?:^|\/)(?:\.|%2e){1,2}(?:;|%3b)/i;

/** Options for {@link url}. */
export interface UrlOptions extends MessageOptions {
  /**
   * Accepted protocols, without the colon, in any letter case. Of the schemes without a host, `mailto`, `tel` and `urn`
   * are accepted, each checked by its own rules even when written with a host; any other is always rejected. `javascript`, `vbscript`
   * and `data` cannot be listed, since their URLs run script.
   *
   * @defaultValue ["http", "https"]
   */
  protocols?: readonly string[];
  /**
   * Validates the host instead of the default rule, that it is a public domain name. It receives the
   * host as the URL parser reads it: a domain in lowercase ASCII with internationalized labels in
   * punycode, an IPv4 address as four decimal parts, or an IPv6 address without its brackets, spelled as
   * `ip()` spells it, while the URL produced keeps the parser's spelling. For a scheme the parser has no rules for, such
   * as `ssh`, it reads a name as written, and the host is that
   * name with its letters in lowercase and its escapes in uppercase, as RFC 3986 normalizes them, and not
   * read as an address, so `redis://2130706433/` gives `"2130706433"`, which a client may read as
   * `127.0.0.1`: check it with `hostname()`, `domain()` or `ip()`, never a list of strings. So
   * `host: hostname()` accepts any hostname, `localhost` included, and `host: union([domain(), ip()])`
   * accepts IP addresses but not `localhost`. Its failure is reported as the URL's, with `params.part`
   * `"host"`.
   */
  host?: AnyValidator;
  /**
   * Validates the credentials, a user and a password written before the host, as in
   * `postgres://app:secret@db.example.com`, which are rejected without it. It receives
   * `{ username, password }` as the parser writes them, percent-encoded, with `password` empty when only
   * a user is written, or `undefined` when the URL names neither, so `credentials: optional(object({
   * username: string(), password: string() }))` accepts a URL with or without them. The URL produced
   * keeps them. A URL without a host, `mailto`, `tel` or `urn`, never takes credentials. Its failure is
   * reported as the URL's, with `params.part` `"credentials"`.
   */
  credentials?: AnyValidator;
  /**
   * Validates the port, a number, or `undefined` when the URL names none or names its scheme's default,
   * which the parser drops. So `port: optional(port())` accepts either, and `port: literal(8080)` requires
   * it. Without it, port 0, which nothing can connect to, is rejected; with it, the validator decides. Its failure is reported as the URL's, with `params.part` `"port"`.
   */
  port?: AnyValidator;
  /**
   * Validates the path as the parser writes it: dot segments resolved and characters such as spaces
   * percent-encoded, starting with `/`, or empty for a URL of a scheme the parser has no rules for, such
   * as `ssh://example.com`, that names no path. A path holding an encoded `/` or `\`, `%2F` or `%5C`, fails
   * before it runs, with `{ encodedSeparator: true }`, since a server that decodes it before routing would
   * read another path than the validator saw, and so does one holding a segment `.` or `..` followed by
   * `;` or `%3B`, such as `/api/..;/admin`, with `{ dotSegment: true }`, since a server that drops the parameters
   * before resolving dot segments would read `..`. Write it as an allowlist, such as
   * `string(startsWith("/api/"))`: a server may also decode an escape, merge `//` or drop `;` and its
   * parameters from a segment, which a denylist such as "not under `/admin`" does not foresee. Its failure
   * is reported as the URL's, with `params.part` `"path"`.
   */
  path?: AnyValidator;
  /**
   * Validates the query, as an object of its decoded parameters: each key's value as a string, or with
   * `repeated` every value of every key as an array. A key given twice fails at `[key]` inside the
   * query unless `repeated` is set. Its failure is reported as the URL's, with `params.part` `"query"`
   * and paths relative to the query in `params.issues`. To reject parameters it does not list,
   * give it `object(shape, { unknownKeys: "strict" })`.
   */
  query?: AnyValidator;
  /**
   * Gives `query` every value of every key as an array, and accepts a key given more than once.
   *
   * @defaultValue false
   */
  repeated?: boolean;
}

/** The part validators an options object names. */
type UrlParts<TOptions> = Extract<
  TOptions[keyof TOptions & ("credentials" | "host" | "port" | "path" | "query")],
  AnyValidator
>;

/**
 * Creates a validator for absolute URLs with an allowed protocol and a public domain name, and
 * without embedded credentials unless a `credentials` validator accepts them. The value is the URL as the URL parser writes it, which is what a
 * request made with it will use.
 *
 * @remarks
 * The text is read by the standard URL parser, and every check is made on what it read: the scheme, the
 * credentials and the host. The value is that reading, serialized, so a check made later on the value
 * sees the URL a request will reach: `https://Example.com/a/../b` is `https://example.com/b`, a host
 * spelled with fullwidth letters or invisible characters is the host they spell, an internationalized
 * host is in punycode, an IPv4 host is four decimal parts, the host of a scheme the parser has no rules
 * for, such as `ssh`, is in lowercase, and characters such as `"` and `<` are percent-encoded. A `mailto` URL gives each recipient as `email` does. Text holding whitespace or control characters is rejected rather than cleaned, and
 * no scheme is guessed for text that lacks one. A host longer than 253 characters is rejected, and so is
 * the host of a scheme the parser has rules for that is written with more than 759, three for each, which
 * is refused before the parser reads it, since the parser takes time that grows with the square of the
 * length of a punycode label, and so is
 * an absolute host such as `example.com.`, whatever the host validator: it names the same host as
 * `example.com`, and a second spelling of one host would let it past a check that compares the value as a
 * string, such as a list of blocked hosts.
 *
 * The `credentials`, `host`, `port`, `path` and `query` options check those parts with validators of your own, which
 * only decide: the value is still the whole URL, and one that is asynchronous makes the validator
 * asynchronous. They apply to URLs with a host; a `mailto`, `tel` or `urn` URL keeps its own rules. A
 * part that fails is one `invalid_format` issue at the URL's own place, `{ format: "url", part, issues }`,
 * so a form shows it beside the field, and the `message` option words it as every other issue of the URL.
 *
 * @example
 * ```ts
 * url()("https://Example.com/a?b=1"); // { ok: true, value: "https://example.com/a?b=1" }
 * url()("http://localhost:3000"); // { ok: false, ... }
 * url({ host: hostname() })("http://localhost:3000"); // { ok: true, value: "http://localhost:3000/" }
 * url({ protocols: ["https"], path: string(startsWith("/api/")), query: object({ page: optional(string()) }) });
 * ```
 *
 * @returns A validator that produces the URL as the parser writes it.
 * @throws {TypeError} When `protocols` is not a non-empty list, a protocol is not a scheme name, for
 * instance `"https:"` with its colon, or is `javascript`, `vbscript` or `data`, whose URLs run script, a
 * part validator is not a function, or `repeated` is not a boolean.
 */
export function url(...checks: Check<string>[]): Validator<string>;
export function url<const TOptions extends UrlOptions>(
  options: TOptions,
  ...checks: Check<string>[]
): Composed<UrlParts<TOptions>, string>;
export function url(...checks: AsyncCheck<string>[]): AsyncValidator<string>;
export function url(options: UrlOptions, ...checks: AsyncCheck<string>[]): AsyncValidator<string>;
export function url(...rest: unknown[]): AnyValidator {
  const [options, checks] = split<UrlOptions, string>(rest, "protocols credentials host port path query repeated");
  const {
    credentials,
    host,
    port,
    path,
    query,
    repeated = false,
    message,
    protocols: listed = ["http", "https"],
  } = options;
  assertParts({ credentials, host, port, path, query });
  assertOption("repeated", repeated, "boolean");
  if (!Array.isArray(listed) || listed.length === 0) {
    // An empty list would make a validator that rejects every URL without saying why.
    throw new TypeError("protocols must be a non-empty list of scheme names");
  }
  const protocols = listed.map((protocol) => {
    if (!SCHEME_PATTERN.test(protocol)) {
      throw new TypeError(`Protocols are scheme names without the colon, such as "https", received "${protocol}"`);
    }
    const scheme = protocol.toLowerCase();
    if (SCRIPT_SCHEMES.includes(scheme)) {
      throw new TypeError(`${scheme} URLs can run script and cannot be accepted`);
    }
    return scheme;
  });

  const read = (text: string): Reading => {
    if (!WRITTEN_URL_PATTERN.test(text) || hasOverlongHost(text) || !URL.canParse(text)) {
      return notFormat("url");
    }
    const parsed = new URL(text);
    const scheme = parsed.protocol.slice(0, -1);
    const isHostless = parsed.host === "" || HOSTLESS_SCHEMES.includes(scheme);
    const hasCredentials = parsed.username !== "" || parsed.password !== "";
    // A credentials validator decides for a URL with a host; one without a host never takes them.
    if (!protocols.includes(scheme) || (hasCredentials && (credentials === undefined || isHostless))) {
      return notFormat("url");
    }
    if (isHostless) {
      const hostless = toHostlessUrl(scheme, parsed.href.slice(parsed.protocol.length), false);
      return hostless === undefined ? notFormat("url") : { value: `${parsed.protocol}${hostless}`, parts: [] };
    }
    // A scheme the parser has no rules for, such as `ssh`, keeps its host as written, so the host is
    // normalized as RFC 3986 does it: letters in lowercase and escapes in uppercase. For any other scheme
    // the parser has done so already, and the host is not written back: some parsers, such as those of Node.js
    // 24.14.1 and of 24.16 to 24.19, read text like `http://äxn--` into a URL whose every setter aborts the process.
    const normalized = parsed.hostname.toLowerCase().replace(/%[\da-f]{2}/g, (escape) => escape.toUpperCase());
    if (normalized !== parsed.hostname) {
      parsed.hostname = normalized;
    }
    const { hostname } = parsed;
    // A host validator replaces the rule of which hosts are public, and never the rules that every runtime
    // reads the host the same: its characters, for a scheme the parser has rules for, and its
    // internationalized labels. Nor does it replace the rule that one host has one spelling, so the final
    // dot of an absolute host, `example.com.`, is rejected for every scheme, as `hostname()` rejects it.
    if (
      hostname.length > HOST_MAX_LENGTH ||
      hostname.endsWith(".") ||
      (host === undefined
        ? !isPublicHost(hostname)
        : !isIdnHost(hostname) || (SPECIAL_SCHEMES.includes(scheme) && !isPlainHost(text, hostname)))
    ) {
      return notFormat("url");
    }
    // Port 0 asks a system for any free port, so no URL can reach it, as `port()` says. A port
    // validator replaces this rule, as a host validator replaces the one above.
    if (port === undefined && parsed.port === "0") {
      return notFormat("url");
    }
    const parts: Part[] = [];
    if (credentials !== undefined) {
      parts.push([
        "credentials",
        credentials,
        hasCredentials ? { username: parsed.username, password: parsed.password } : undefined,
      ]);
    }
    if (host !== undefined) {
      // An IPv6 host is given as `ip()` spells it, its IPv4 part dotted when it is IPv4-mapped or NAT64, so
      // `host: ip()` and a list of addresses `ip()` produced agree. The value keeps the parser's hex groups.
      parts.push(["host", host, hostname.startsWith("[") ? toCanonicalIpv6(hostname.slice(1, -1)) : hostname]);
    }
    if (port !== undefined) {
      parts.push(["port", port, parsed.port === "" ? undefined : Number(parsed.port)]);
    }
    if (path !== undefined) {
      // An encoded `/` or `\` is one segment to the parser and to a check on the path, and two to a server
      // that decodes it before routing, so `/api/..%2fadmin` would pass a check for `/api/` and reach
      // `/admin`. It fails before the path validator runs, as a repeated query key does.
      if (ENCODED_SEPARATOR_PATTERN.test(parsed.pathname)) {
        return { issues: [partIssue("url", "path", [issue("invalid_value", { encodedSeparator: true })])] };
      }
      // So is `..;`: one segment to the parser, and `..` to a server that drops parameters first, so
      // `/api/..;/admin` would reach `/admin` too.
      if (DOT_SEGMENT_PATTERN.test(parsed.pathname)) {
        return { issues: [partIssue("url", "path", [issue("invalid_value", { dotSegment: true })])] };
      }
      parts.push(["path", path, parsed.pathname]);
    }
    if (query !== undefined) {
      const { value, issues } = readQuery(parsed.searchParams, repeated);
      if (issues.length > 0) {
        return { issues: [partIssue("url", "query", issues)] };
      }
      parts.push(["query", query, value]);
    }
    return { value: parsed.href, parts };
  };
  return partsFormat("url", read, message, checks);
}
