import { hasAsciiControlCharacter } from "../core/string-validation";

/** The longest pathname accepted. @internal */
export const MAX_PATHNAME_LENGTH = 8_192;
/**
 * The most segments a pathname may have. Reading a path costs work per segment in every locale, so 4,000 one-letter
 * segments, which fit in 8,192 characters, took about 39 ms a `parse()` with 20 locales. @internal
 */
export const MAX_PATHNAME_SEGMENTS = 100;
const DISALLOWED_ESCAPE_PATTERN = /%(?![0-9a-f]{2})|%(?:0[0-9a-f]|1[0-9a-f]|25|2f|5c|7f)/i;

/**
 * Whether a pathname is longer than 8,192 characters or has more than 100 segments, which routing refuses.
 *
 * @internal
 */
export const isPathnameTooLong = (pathname: string): boolean => {
  if (pathname.length > MAX_PATHNAME_LENGTH) {
    return true;
  }
  // Each segment follows a slash; a trailing slash, or `/` itself, starts none.
  const maxSlashes = pathname.endsWith("/") ? MAX_PATHNAME_SEGMENTS + 1 : MAX_PATHNAME_SEGMENTS;
  let slashes = 0;
  for (let index = pathname.indexOf("/"); index !== -1; index = pathname.indexOf("/", index + 1)) {
    slashes += 1;
    if (slashes > maxSlashes) {
      return true;
    }
  }
  return false;
};

/**
 * Says why a value is not an absolute application pathname, or returns `undefined` when it is one.
 *
 * @internal
 */
export const findPathnameProblem = (pathname: unknown): "invalid" | "dot-segment" | undefined => {
  if (
    typeof pathname !== "string" ||
    pathname.length === 0 ||
    isPathnameTooLong(pathname) ||
    !pathname.startsWith("/") ||
    pathname.includes("//") ||
    pathname.includes("?") ||
    pathname.includes("#") ||
    pathname.includes("\\") ||
    hasAsciiControlCharacter(pathname) ||
    DISALLOWED_ESCAPE_PATTERN.test(pathname)
  ) {
    return "invalid";
  }

  const hasDotSegment = pathname.split("/").some((segment) => [".", ".."].includes(segment.replaceAll(/%2e/gi, ".")));
  return hasDotSegment ? "dot-segment" : undefined;
};

/** A pathname split into segments, with its trailing slash noted, so `/` has no segments. @internal */
export interface SplitPathname {
  readonly segments: readonly string[];
  readonly hasTrailingSlash: boolean;
}

/** @internal */
export const splitPathname = (pathname: string): SplitPathname => {
  const hasTrailingSlash = pathname.length > 1 && pathname.endsWith("/");
  const body = hasTrailingSlash ? pathname.slice(0, -1) : pathname;
  return {
    segments: body === "/" ? [] : body.slice(1).split("/"),
    hasTrailingSlash,
  };
};

/** Joins segments into a pathname. The root never gets a trailing slash. @internal */
export const joinPathname = (segments: readonly string[], hasTrailingSlash: boolean): string =>
  segments.length === 0 ? "/" : `/${segments.join("/")}${hasTrailingSlash ? "/" : ""}`;

// A segment of only these characters is written as a URL writes it already: unreserved and reserved ASCII that
// `encodeURI` leaves as they are.
const NORMAL_SEGMENT_PATTERN = /^[A-Za-z0-9\-._~!$&'()*+,;=:@]*$/;
const UNRESERVED_PATTERN = /^[A-Za-z0-9\-._~]$/;
// An escape, or one code point that is not `%`, so a surrogate pair is encoded as one character.
const SEGMENT_PART_PATTERN = /%[0-9a-f]{2}|[^%]/giu;
// The escape a URL writes for a lone surrogate, which is not text: that of U+FFFD, the replacement character.
const REPLACEMENT_CHARACTER_ESCAPE = "%EF%BF%BD";

/**
 * Writes a segment as RFC 3986 normalizes it: an escape of an unreserved character, such as `%61`, becomes the
 * character, every other escape is written in upper case, and a character a URL encodes is encoded. So `café`,
 * `caf%c3%a9` and `caf%C3%A9` compare equal, while `c%2B%2B` and `c++` stay apart, since a server may read an escaped
 * reserved character, such as `%3B` or `%2B`, differently from the character.
 *
 * @internal
 */
export const normalizeSegment = (segment: string): string => {
  if (NORMAL_SEGMENT_PATTERN.test(segment)) {
    return segment;
  }
  return segment.replace(SEGMENT_PART_PATTERN, (part) => {
    if (part.startsWith("%")) {
      const character = String.fromCharCode(Number.parseInt(part.slice(1), 16));
      return UNRESERVED_PATTERN.test(character) ? character : part.toUpperCase();
    }
    try {
      return encodeURI(part).replaceAll("?", "%3F").replaceAll("#", "%23");
    } catch {
      return REPLACEMENT_CHARACTER_ESCAPE;
    }
  });
};
