import { hasAsciiControlCharacter } from "../core/string-validation";

/** The longest pathname accepted. @internal */
export const MAX_PATHNAME_LENGTH = 8_192;
/**
 * The most segments a pathname may have. Reading a path costs work per segment in every locale, so 4,000 one-letter
 * segments, which fit in 8,192 characters, took about 39 ms a `parse()` with 20 locales. @internal
 */
export const MAX_PATHNAME_SEGMENTS = 100;
// A `%` without two hex digits after it, or an escape of `/`, `\`, `%`, or a control character.
const DISALLOWED_ESCAPE_PATTERN = /%(?![0-9a-f]{2})|%(?:0[0-9a-f]|1[0-9a-f]|25|2f|5c|7f)/i;

const hasTooManySegments = (pathname: string): boolean => {
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
 * Whether a pathname is longer than 8,192 characters or has more than 100 segments, which routing refuses.
 *
 * @internal
 */
export const isPathnameTooLong = (pathname: string): boolean =>
  pathname.length > MAX_PATHNAME_LENGTH || hasTooManySegments(pathname);

/**
 * Whether the pathname that {@link joinPathname} makes of segments, none of which contains `/`, is too long, as
 * {@link isPathnameTooLong} says, without joining them.
 *
 * @internal
 */
export const areSegmentsTooLong = (segments: readonly string[], hasTrailingSlash: boolean): boolean => {
  if (segments.length > MAX_PATHNAME_SEGMENTS) {
    return true;
  }
  let length = segments.length === 0 ? 1 : segments.length + (hasTrailingSlash ? 1 : 0);
  for (const segment of segments) {
    length += segment.length;
  }
  return length > MAX_PATHNAME_LENGTH;
};

/** Why a value is not an absolute application pathname. @internal */
export type PathnameProblem =
  | "not-string"
  | "not-absolute"
  | "query"
  | "fragment"
  | "too-long"
  | "too-many-segments"
  | "empty-segment"
  | "backslash"
  | "control-character"
  | "encoded-slash"
  | "encoded-backslash"
  | "encoded-percent"
  | "encoded-control-character"
  | "malformed-escape"
  | "dot-segment";

/** What a problem's path must do, worded to follow "must". */
const PATHNAME_RULES: Readonly<Record<PathnameProblem, string>> = {
  "not-string": "be a string",
  "not-absolute": "start with /",
  query: "not contain ?, which starts a query",
  fragment: "not contain #, which starts a fragment",
  "too-long": "be at most 8,192 characters",
  "too-many-segments": "have at most 100 segments",
  "empty-segment": "not contain an empty segment, as // makes",
  backslash: "not contain a backslash",
  "control-character": "not contain a control character",
  "encoded-slash": "not contain an encoded slash, %2F",
  "encoded-backslash": "not contain an encoded backslash, %5C",
  "encoded-percent": "not contain an encoded %, %25",
  "encoded-control-character": "not contain an encoded control character, %00 to %1F or %7F",
  "malformed-escape": "not contain a % that two hex digits don't follow",
  "dot-segment": "not contain a dot segment, . or ..",
};

/**
 * The rule a pathname with this problem breaks, worded to follow "must", such as "not contain a backslash".
 *
 * @internal
 */
export const describePathnameRule = (problem: PathnameProblem): string => PATHNAME_RULES[problem];

const findEscapeProblem = (pathname: string): PathnameProblem | undefined => {
  const escape = DISALLOWED_ESCAPE_PATTERN.exec(pathname)?.[0].toLowerCase();
  // The pattern matches a malformed escape as its `%` alone.
  return escape === undefined
    ? undefined
    : escape === "%"
      ? "malformed-escape"
      : escape === "%2f"
        ? "encoded-slash"
        : escape === "%5c"
          ? "encoded-backslash"
          : escape === "%25"
            ? "encoded-percent"
            : "encoded-control-character";
};

/**
 * Says why a value is not an absolute application pathname, or returns `undefined` when it is one. The first four
 * problems are ones a URL's pathname never has.
 *
 * @internal
 */
export const findPathnameProblem = (pathname: unknown): PathnameProblem | undefined => {
  if (typeof pathname !== "string") {
    return "not-string";
  }
  if (!pathname.startsWith("/")) {
    return "not-absolute";
  }
  // A URL reads the first of them as the end of its path.
  const delimiter = /[?#]/.exec(pathname)?.[0];
  if (delimiter !== undefined) {
    return delimiter === "?" ? "query" : "fragment";
  }
  if (pathname.length > MAX_PATHNAME_LENGTH) {
    return "too-long";
  }
  if (hasTooManySegments(pathname)) {
    return "too-many-segments";
  }
  if (pathname.includes("//")) {
    return "empty-segment";
  }
  if (pathname.includes("\\")) {
    return "backslash";
  }
  if (hasAsciiControlCharacter(pathname)) {
    return "control-character";
  }
  const escapeProblem = findEscapeProblem(pathname);
  if (escapeProblem !== undefined) {
    return escapeProblem;
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
