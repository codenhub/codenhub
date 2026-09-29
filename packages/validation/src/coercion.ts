/*
 * Conversions behind `val.coerce.*`. Each returns `undefined` when the input cannot be converted,
 * which is safe as a failure marker because none of them produces `undefined`.
 */

const DECIMAL_INTEGER_PATTERN = /^[+-]?\d+$/;
const DECIMAL_NUMBER_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)?$/;
const TRUE_WORDS = new Set(["true", "1", "yes", "on"]);
const FALSE_WORDS = new Set(["false", "0", "no", "off"]);

/** Tests whether `YYYY-MM-DD` names a day that exists, rejecting `2026-02-30`. */
export const isCalendarDate = (text: string): boolean => {
  const [year, month, day] = text.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const isTextLike = (input: unknown): input is string | number | bigint | boolean =>
  ["string", "number", "bigint", "boolean"].includes(typeof input);

/** Converts strings, numbers, bigints and booleans to their string form. */
export function coerceToString(input: unknown): string | undefined {
  return isTextLike(input) ? String(input) : undefined;
}

/** Converts a finite number, or a string holding a decimal number, to a number. Empty strings fail. */
export function coerceToNumber(input: unknown): number | undefined {
  if (typeof input === "number") {
    return Number.isFinite(input) ? input : undefined;
  }
  if (typeof input !== "string" || !DECIMAL_NUMBER_PATTERN.test(input.trim())) {
    return undefined;
  }
  const converted = Number(input.trim());
  return Number.isFinite(converted) ? converted : undefined;
}

/** Converts a bigint, an integer number, or a string holding a decimal integer to a bigint. */
export function coerceToBigint(input: unknown): bigint | undefined {
  if (typeof input === "bigint") {
    return input;
  }
  if (typeof input === "number") {
    return Number.isSafeInteger(input) ? BigInt(input) : undefined;
  }
  return typeof input === "string" && DECIMAL_INTEGER_PATTERN.test(input.trim()) ? BigInt(input.trim()) : undefined;
}

/** Converts booleans, and the words `true`/`false`, `yes`/`no`, `on`/`off` and `1`/`0` in any case, to a boolean. */
export function coerceToBoolean(input: unknown): boolean | undefined {
  if (typeof input === "boolean") {
    return input;
  }
  if (typeof input !== "string" && typeof input !== "number") {
    return undefined;
  }
  const word = String(input).trim().toLowerCase();
  if (TRUE_WORDS.has(word)) {
    return true;
  }
  return FALSE_WORDS.has(word) ? false : undefined;
}

/** Converts a valid Date, a finite timestamp, or an ISO 8601 date string to a valid Date. */
export function coerceToDate(input: unknown): Date | undefined {
  let converted: Date | undefined;
  if (input instanceof Date) {
    converted = input;
  } else if (typeof input === "number" && Number.isFinite(input)) {
    converted = new Date(input);
  } else if (typeof input === "string") {
    const text = input.trim();
    if (ISO_DATE_PATTERN.test(text) && isCalendarDate(text.slice(0, 10))) {
      converted = new Date(text);
    }
  }
  return converted !== undefined && !Number.isNaN(converted.getTime()) ? converted : undefined;
}
