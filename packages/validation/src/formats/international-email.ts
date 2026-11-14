import type { AnyValidator, AsyncCheck, AsyncSchema, Check, Composed, Schema } from "../core/types";
import { emailOf, type EmailOptions, type EmailParts } from "./email";
import { toEmailAddress } from "./email-address";

/**
 * Creates a validator for email addresses with a public domain name, which may be internationalized.
 *
 * @remarks
 * It validates as `email` does, and reads a domain as the URL parser does, so the value holds it in
 * lowercase ASCII with internationalized labels in punycode: `Ada@München.DE` is
 * `Ada@xn--mnchen-3ya.de`, and every spelling that names one domain, such as fullwidth letters or an
 * invisible variation selector, gives one address. A punycode label is decoded and checked as every
 * browser checks it. A domain written with more than 759 characters, three for each one a domain can
 * have, is rejected before the parser reads it. The local part is ASCII, as in `email`.
 *
 * It carries the punycode decoder and the rule for right-to-left labels, which `email` leaves out: use
 * it where an address may be written with such a domain.
 *
 * @example
 * ```ts
 * internationalEmail()("Ada@München.DE"); // { ok: true, value: "Ada@xn--mnchen-3ya.de" }
 * internationalEmail()("ada@localhost"); // { ok: false, error: { issues: [{ code: "invalid_format", ... }] } }
 * ```
 *
 * @returns A validator that produces the address, its domain as the parser reads it.
 * @throws {TypeError} When `domain` or `local` is not a validator, or `allowPlus` is not a boolean.
 */
export function internationalEmail(...checks: Check<string>[]): Schema<string, string>;
export function internationalEmail<const TOptions extends EmailOptions>(
  options: TOptions,
  ...checks: Check<string>[]
): Composed<EmailParts<TOptions>, string, string>;
export function internationalEmail(...checks: AsyncCheck<string>[]): AsyncSchema<string, string>;
export function internationalEmail(options: EmailOptions, ...checks: AsyncCheck<string>[]): AsyncSchema<string, string>;
export function internationalEmail(...rest: unknown[]): AnyValidator {
  return emailOf(rest, toEmailAddress);
}
