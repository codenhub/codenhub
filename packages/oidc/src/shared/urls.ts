/** Schemes a redirect URI must never use, because a browser would run them rather than navigate. */
const FORBIDDEN_REDIRECT_PROTOCOLS: ReadonlySet<string> = new Set(["javascript:", "data:", "vbscript:", "file:"]);

const FIRST_VISIBLE_ASCII = 0x21;
const LAST_VISIBLE_ASCII = 0x7e;
const BACKSLASH = 0x5c;

/**
 * Whether a string holds anything but visible ASCII except backslash. The URL parser strips spaces and controls,
 * drops tabs and newlines anywhere, and maps non-ASCII host characters through IDNA (`example。com` becomes
 * `example.com`), so such a string would differ from the URL it serializes to. Special schemes also rewrite a
 * backslash to a slash (`https://example.com\evil.com` becomes `https://example.com/evil.com`). Internationalized
 * URLs are written in their ASCII form: punycode hosts and percent-encoded paths.
 */
function hasNonVisibleAscii(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < FIRST_VISIBLE_ASCII || code > LAST_VISIBLE_ASCII || code === BACKSLASH) {
      return true;
    }
  }
  return false;
}

/**
 * Tests whether a value is an absolute `https:` URL of visible ASCII, with no credentials and no fragment.
 *
 * A `#` anywhere in the string counts as a fragment, even an empty one, because the URL parser drops
 * an empty fragment and the caller should still see it as present.
 */
export function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.includes("#") || hasNonVisibleAscii(value) || !URL.canParse(value)) {
    return false;
  }
  const url = new URL(value);
  return url.protocol === "https:" && url.username === "" && url.password === "";
}

/**
 * Tests whether a value is an absolute URL of visible ASCII usable as a redirect URI, with no credentials and
 * no fragment.
 *
 * Any scheme is accepted except those a browser would execute, since native apps register custom schemes.
 */
export function isRedirectUri(value: unknown): value is string {
  if (typeof value !== "string" || value.includes("#") || hasNonVisibleAscii(value) || !URL.canParse(value)) {
    return false;
  }
  const url = new URL(value);
  return !FORBIDDEN_REDIRECT_PROTOCOLS.has(url.protocol) && url.username === "" && url.password === "";
}
