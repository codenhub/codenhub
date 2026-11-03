import { hasAsciiControlCharacter } from "../core/string-validation";

/** The longest pathname accepted. @internal */
export const MAX_PATHNAME_LENGTH = 8_192;
const DISALLOWED_ESCAPE_PATTERN = /%(?![0-9a-f]{2})|%(?:0[0-9a-f]|1[0-9a-f]|25|2f|5c|7f)/i;
const PERCENT_ESCAPE_PATTERN = /%[0-9a-f]{2}/gi;

/**
 * Says why a value is not an absolute application pathname, or returns `undefined` when it is one.
 *
 * @internal
 */
export const findPathnameProblem = (pathname: unknown): "invalid" | "dot-segment" | undefined => {
  if (
    typeof pathname !== "string" ||
    pathname.length === 0 ||
    pathname.length > MAX_PATHNAME_LENGTH ||
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

/**
 * Writes a segment the way a URL's pathname does, so `configurações`, `configura%c3%a7%c3%b5es` and
 * `configura%C3%A7%C3%B5es` compare equal and a Unicode table entry is emitted percent-encoded.
 *
 * @internal
 */
export const normalizeSegment = (segment: string): string => {
  try {
    return encodeURI(decodeURIComponent(segment)).replaceAll("?", "%3F").replaceAll("#", "%23");
  } catch {
    // Escapes that are not UTF-8, such as a lone `%C3`, can't be decoded; keep them, in one letter case, and encode
    // the rest as a browser would.
    return segment
      .replace(PERCENT_ESCAPE_PATTERN, (escape) => escape.toUpperCase())
      .replace(/[^%]/gu, (character) => {
        try {
          return encodeURI(character).replaceAll("?", "%3F").replaceAll("#", "%23");
        } catch {
          return character; // A lone surrogate can't be encoded.
        }
      });
  }
};
