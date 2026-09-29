import type { Validator } from "../core/types";
import { isPublicHost } from "./patterns";
import { textFormat } from "./text-format";

/**
 * Characters the URL parser strips or rewrites instead of rejecting: control characters, spaces and
 * backslashes. The value is returned as it came, so text holding them would pass as one URL and be
 * read as another, or carry a line break into a header.
 */
// oxlint-disable-next-line no-control-regex
const UNPARSED_CHARACTER_PATTERN = /[\u0000-\u0020\u007f\\]/;

/** Options for {@link url}. */
export interface UrlOptions {
  /**
   * Accepted protocols, without the colon.
   *
   * @defaultValue ["http", "https"]
   */
  protocols?: readonly string[];
  /**
   * Accepts hosts that are not public domain names: `localhost`, single-label hosts, IP addresses, and
   * special-use names such as `app.localhost`, `db.internal` or `printer.local`.
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
 * surrounding or embedded whitespace, control characters such as line breaks, and backslashes.
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
 */
export function url(options: UrlOptions = {}): Validator<string> {
  const protocols = [...(options.protocols ?? ["http", "https"])];
  const allowLocal = options.allowLocal ?? false;
  return textFormat("url", (text) => {
    if (UNPARSED_CHARACTER_PATTERN.test(text) || !URL.canParse(text)) {
      return false;
    }
    const parsed = new URL(text);
    return (
      protocols.includes(parsed.protocol.slice(0, -1)) &&
      parsed.username === "" &&
      parsed.password === "" &&
      (allowLocal || isPublicHost(parsed.hostname))
    );
  });
}
