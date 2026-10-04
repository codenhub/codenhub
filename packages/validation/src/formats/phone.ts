import { formatFactory } from "./text-format";

/**
 * `+`, then a digit from 1 to 9, which starts every country code, then digits with the separators
 * people type between them: single spaces, hyphens or dots, and parentheses around a group. Each
 * repetition starts with a digit or a separator and ends on a digit, so matching stays linear.
 */
const PHONE_PATTERN = /^\+[1-9](?:[ .-]?(?:\(\d+\)|\d))*$/;
/**
 * The national trunk prefix written in parentheses, as in `+44 (0)20 7946 0958`: dialed only from inside
 * the country, so it has no digit in E.164, and keeping it would make another number.
 */
const TRUNK_PREFIX_PATTERN = /\(0\)/;
/** E.164 allows at most 15 digits; the shortest numbers in use have 7. */
const MIN_DIGITS = 7;
const MAX_DIGITS = 15;

/**
 * Creates a validator for international phone numbers in E.164 form: a `+`, the country code and the
 * number, 7 to 15 digits in all, optionally with spaces, hyphens, dots or parentheses between digits.
 * The value is the canonical E.164 spelling, `+` and the digits alone, so one number is one value
 * however it was written.
 *
 * @remarks
 * Only the international form is accepted, since a national number means nothing without knowing its
 * country. A national trunk prefix in parentheses, as in `+44 (0)20 7946 0958`, is rejected: it is no
 * part of the international number, and dropping it would rewrite what was written. Whether the number exists, and whether it fits its country's numbering plan, is not checked.
 *
 * @example
 * ```ts
 * phone()("+55 (11) 98765-4321"); // { ok: true, value: "+5511987654321" }
 * phone()("(11) 98765-4321"); // { ok: false, ... }: no country code
 * ```
 */
export const phone = /* @__PURE__ */ formatFactory("phone", (text) => {
  if (!PHONE_PATTERN.test(text) || TRUNK_PREFIX_PATTERN.test(text)) {
    return undefined;
  }
  const digits = text.replace(/\D/g, "");
  return digits.length >= MIN_DIGITS && digits.length <= MAX_DIGITS ? `+${digits}` : undefined;
});
