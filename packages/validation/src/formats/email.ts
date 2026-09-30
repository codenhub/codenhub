import type { Validator } from "../core/types";
import { toEmailAddress } from "./email-address";
import { canonicalFormat } from "./text-format";

/** Options for {@link email}. */
export interface EmailOptions {
  /**
   * Accepts `+` in the local part, as in `me+tag@example.com`.
   *
   * @defaultValue true
   */
  allowPlus?: boolean;
}

/**
 * Creates a validator for email addresses with a public domain name, which may be internationalized.
 *
 * @remarks
 * The value is the address as mail is delivered to it: the local part as written, and the domain as
 * the URL parser reads it, lowercase ASCII with internationalized labels in punycode. So
 * `Ada@München.DE` is `Ada@xn--mnchen-3ya.de`, and every spelling that names one domain, such as
 * fullwidth letters or an invisible variation selector, gives one address. The local part must be
 * ASCII: addresses with letters beyond it (RFC 6531) are rejected. Surrounding whitespace is not
 * trimmed; trim first with `pipe` when the input may need it.
 *
 * @example
 * ```ts
 * email()("Ada@Example.COM"); // { ok: true, value: "Ada@example.com" }
 * email()("ada@localhost"); // { ok: false, error: { issues: [{ code: "invalid_format", ... }] } }
 * ```
 *
 * @param options - Whether `+` is allowed in the local part.
 * @returns A validator that produces the address, its domain as the parser reads it.
 */
export function email(options: EmailOptions = {}): Validator<string> {
  const allowPlus = options.allowPlus ?? true;
  return canonicalFormat("email", (text) => toEmailAddress(text, allowPlus, false));
}
