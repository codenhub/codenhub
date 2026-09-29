import type { Validator } from "../core/types";
import { isEmailAddress } from "./email-address";
import { textFormat } from "./text-format";

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
 * Creates a validator for email addresses with a public domain name, which may be internationalized (`ada@münchen.de`). The local part must be ASCII: addresses with letters beyond it (RFC 6531) are rejected. An internationalized domain must be in NFKC form, as the URL parser reads it, so fullwidth letters, ligatures and decomposed letters are rejected and each address has one accepted spelling. The value is not modified, so
 * trim and lowercase it first with `pipe` when the input may need it.
 *
 * @example
 * ```ts
 * email()("ada@example.com"); // { ok: true, value: "ada@example.com" }
 * email()("ada@localhost"); // { ok: false, error: { issues: [{ code: "invalid_format", ... }] } }
 * ```
 *
 * @param options - Whether `+` is allowed in the local part.
 * @returns A validator that produces the address as a string.
 */
export function email(options: EmailOptions = {}): Validator<string> {
  const allowPlus = options.allowPlus ?? true;
  return textFormat("email", (text) => isEmailAddress(text, allowPlus, false));
}
