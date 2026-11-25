import { formatReportedKey } from "./dictionary";

/**
 * Quotes text from input as {@link formatReportedKey} does, up to the first `?` or `#`, as `"/about?…"`, since a query
 * or fragment can hold a token.
 *
 * @internal
 */
export const formatReportedInput = (text: string): string => {
  const end = text.search(/[?#]/);
  return formatReportedKey(end === -1 ? text : `${text.slice(0, end + 1)}…`);
};

/**
 * The message for a locale that isn't configured, with the value quoted by {@link formatReportedInput}, since it is
 * calling code's, often from a URL, a header, or a cookie.
 *
 * @internal
 */
export const describeUnsupportedLocale = (value: unknown): string =>
  typeof value === "string"
    ? `[I18n] Unsupported locale ${formatReportedInput(value)}.`
    : `[I18n] Unsupported locale of type ${typeof value}.`;
