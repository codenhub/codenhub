/** Schemes a redirect URI must never use, because a browser would run them rather than navigate. */
const FORBIDDEN_REDIRECT_PROTOCOLS: ReadonlySet<string> = new Set(["javascript:", "data:", "vbscript:", "file:"]);

/**
 * Tests whether a value is an absolute `https:` URL with no credentials and no fragment.
 *
 * A `#` anywhere in the string counts as a fragment, even an empty one, because the URL parser drops
 * an empty fragment and the caller should still see it as present.
 */
export function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.includes("#") || !URL.canParse(value)) {
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
  if (typeof value !== "string" || value.includes("#") || !URL.canParse(value)) {
    return false;
  }
  const url = new URL(value);
  return !FORBIDDEN_REDIRECT_PROTOCOLS.has(url.protocol) && url.username === "" && url.password === "";
}
