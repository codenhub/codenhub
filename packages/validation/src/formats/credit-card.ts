import { formatFactory } from "./text-format";

/** 12 to 19 digits, optionally in groups separated by single spaces or single hyphens, not both. */
const CARD_PATTERN = /^\d+(?:(?: \d+)*|(?:-\d+)*)$/;
const MIN_DIGITS = 12;
const MAX_DIGITS = 19;

/** The Luhn checksum every payment card number carries in its last digit. */
const passesLuhn = (digits: string): boolean => {
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    const digit = Number(digits[digits.length - 1 - index]);
    const doubled = index % 2 === 1 ? digit * 2 : digit;
    sum += doubled > 9 ? doubled - 9 : doubled;
  }
  return sum % 10 === 0;
};

/**
 * Creates a validator for payment card numbers: 12 to 19 digits whose Luhn checksum holds, optionally
 * grouped by spaces or hyphens as people type them. The value is the digits alone, so one card is one
 * value however it was grouped.
 *
 * @remarks
 * Only the structure is checked: whether the number was issued, and by which network, is not known
 * from the number alone. Card numbers are sensitive, and like every value they never appear in an issue.
 *
 * @example
 * ```ts
 * creditCard()("4242 4242 4242 4242"); // { ok: true, value: "4242424242424242" }
 * creditCard()("4242 4242 4242 4241"); // { ok: false, ... }: the checksum fails
 * ```
 */
export const creditCard = /* @__PURE__ */ formatFactory("creditCard", (text) => {
  if (!CARD_PATTERN.test(text)) {
    return undefined;
  }
  const digits = text.replace(/[ -]/g, "");
  return digits.length >= MIN_DIGITS && digits.length <= MAX_DIGITS && passesLuhn(digits) ? digits : undefined;
});
