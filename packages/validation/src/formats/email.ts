import type { Validator } from "../core/types";
import { PUBLIC_HOST_PATTERN } from "./patterns";
import { textFormat } from "./text-format";

const EMAIL_LOCAL_PATTERN = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i;
const EMAIL_LOCAL_MAX_LENGTH = 64;
const EMAIL_MAX_LENGTH = 254;

/** Options for {@link email}. */
export interface EmailOptions {
  /**
   * Accepts `+` in the local part, as in `me+tag@example.com`.
   *
   * @defaultValue true
   */
  allowPlus?: boolean;
}

const isEmail = (text: string, allowPlus: boolean): boolean => {
  const [local, host, extra] = text.split("@");
  return (
    extra === undefined &&
    local !== undefined &&
    host !== undefined &&
    text.length <= EMAIL_MAX_LENGTH &&
    local.length <= EMAIL_LOCAL_MAX_LENGTH &&
    EMAIL_LOCAL_PATTERN.test(local) &&
    PUBLIC_HOST_PATTERN.test(host) &&
    (allowPlus || !local.includes("+"))
  );
};

/**
 * Creates a validator for email addresses with a public domain name. The value is not modified, so
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
  return textFormat("email", (text) => isEmail(text, allowPlus));
}
