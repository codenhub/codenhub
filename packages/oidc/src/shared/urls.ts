/** Schemes a redirect URI must never use, because a browser would run them rather than navigate. */
const FORBIDDEN_REDIRECT_PROTOCOLS: ReadonlySet<string> = new Set(["javascript:", "data:", "vbscript:", "file:"]);

/**
 * Whether a string holds a control character or space. The URL parser strips some of these and drops tabs
 * and newlines anywhere, so a string holding them would differ from the URL it serializes to.
 */
const hasControlOrSpace = (value: string): boolean =>
  [...value].some((char) => {
    const code = char.charCodeAt(0);
    return code <= 0x20 || code === 0x7f;
  });

/**
 * Tests whether a value is an absolute `https:` URL with no credentials and no fragment.
 *
 * A `#` anywhere in the string counts as a fragment, even an empty one, because the URL parser drops
 * an empty fragment and the caller should still see it as present.
 */
export function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.includes("#") || hasControlOrSpace(value) || !URL.canParse(value)) {
    return false;
  }
  const url = new URL(value);
  return url.protocol === "https:" && url.username === "" && url.password === "";
}

/**
 * Tests whether a value is an absolute URL usable as a redirect URI, with no credentials and no fragment.
 *
 * Any scheme is accepted except those a browser would execute, since native apps register custom schemes.
 */
export function isRedirectUri(value: unknown): value is string {
  if (typeof value !== "string" || value.includes("#") || hasControlOrSpace(value) || !URL.canParse(value)) {
    return false;
  }
  const url = new URL(value);
  return !FORBIDDEN_REDIRECT_PROTOCOLS.has(url.protocol) && url.username === "" && url.password === "";
}
