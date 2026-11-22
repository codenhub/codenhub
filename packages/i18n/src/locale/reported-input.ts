import { formatReportedKey } from "./dictionary";

// What a URL parser skips as it reads: leading C0 controls and spaces, up to U+0020, and every tab and line break.
const MAX_SKIPPED_LEADING_CODE = 0x20;
const URL_SKIPPED_PATTERN = /[\t\n\r]/g;
// A scheme, or two slashes of which an http(s) URL reads `\` as one, starts a URL of its own, whose host can carry user
// info. Checked on Node.js 26.13 against `new URL(value, "https://base.example")` for every ASCII character before,
// between, and after the slashes.
const URL_START_PATTERN = /^(?:[A-Za-z][A-Za-z0-9+.-]*:|[/\\]{2})/;

// Whether a URL parser reads text as a URL of its own, such as `https://…`, `//host`, or `/\host`, rather than a path.
const readsAsUrl = (text: string): boolean => {
  let start = 0;
  while (start < text.length && text.charCodeAt(start) <= MAX_SKIPPED_LEADING_CODE) {
    start += 1;
  }
  return URL_START_PATTERN.test(text.slice(start).replaceAll(URL_SKIPPED_PATTERN, ""));
};

/**
 * Quotes text from input as {@link formatReportedKey} does, leaving out what a URL parser reads as user info, a query,
 * or a fragment, any of which can hold a credential: text that starts with a scheme or `//`, as a URL reads it, is not
 * quoted, returning `undefined`, and text with `?` or `#` is quoted up to the first of them, as `"/about?…"`.
 *
 * @internal
 */
export const formatReportedInput = (text: string): string | undefined => {
  if (readsAsUrl(text)) {
    return undefined;
  }
  const end = text.search(/[?#]/);
  return formatReportedKey(end === -1 ? text : `${text.slice(0, end + 1)}…`);
};

/**
 * The message for a locale that isn't configured, with the value quoted by {@link formatReportedInput}, since it is
 * calling code's, often from a URL, a header, or a cookie.
 *
 * @internal
 */
export const describeUnsupportedLocale = (value: unknown): string => {
  if (typeof value !== "string") {
    return `[I18n] Unsupported locale of type ${typeof value}.`;
  }
  const quoted = formatReportedInput(value);
  return quoted === undefined
    ? "[I18n] Unsupported locale, not quoted since it reads as a URL."
    : `[I18n] Unsupported locale ${quoted}.`;
};
