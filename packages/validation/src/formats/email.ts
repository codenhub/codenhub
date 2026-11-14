import { assertOption } from "../core/result";
import { split } from "../core/split";
import type { AnyValidator, AsyncCheck, AsyncSchema, Check, Composed, MessageOptions, Schema } from "../core/types";
import { toPlainEmailAddress, type ReadAddress } from "./email-address";
import { assertParts, notFormat, partsFormat, type Part } from "./parts";
import { formatted } from "./text-format";

/** Options for {@link email} and `internationalEmail`. */
export interface EmailOptions extends MessageOptions {
  /**
   * Accepts `+` in the local part, as in `me+tag@example.com`.
   *
   * @defaultValue true
   */
  allowPlus?: boolean | undefined;
  /**
   * Validates the domain instead of the default rule, that it is a public domain name. It receives the
   * domain as the value holds it, lowercase ASCII, with internationalized labels in punycode from
   * `internationalEmail`, and the domain must still be a hostname: `email({ domain: hostname() })` accepts `ada@localhost`, and
   * `email({ domain: oneOf(["example.com"]) })` accepts that domain alone. Its failure is reported as
   * the address's, with `params.part` `"domain"`.
   */
  domain?: AnyValidator | undefined;
  /**
   * Validates the local part, the text before the `@`, as written. Its failure is reported as the
   * address's, with `params.part` `"local"`.
   */
  local?: AnyValidator | undefined;
}

/** The part validators an options object names. */
export type EmailParts<TOptions> = Extract<TOptions[keyof TOptions & ("domain" | "local")], AnyValidator>;

/**
 * Makes an email validator of what follows its name, options and then checks, which reads an address
 * with `read`: `email` and `internationalEmail` differ in that, so each carries its own reader and no
 * other, and in `international`, which says in the description that the domain may be internationalized.
 */
export function emailOf(rest: readonly unknown[], read: ReadAddress, international?: true): AnyValidator {
  const [options, checks] = split<EmailOptions, string>(rest, "allowPlus domain local");
  const { allowPlus = true, domain, local, message } = options;
  assertOption("allowPlus", allowPlus, "boolean");
  assertParts({ domain, local });
  const validator = partsFormat(
    "email",
    (text) => {
      // A domain validator replaces the rule that the domain is public, never the rule that it is a host.
      const address = read(text, allowPlus, domain !== undefined);
      if (address === undefined) {
        return notFormat("email");
      }
      const at = address.lastIndexOf("@");
      const parts: Part[] = [];
      if (local !== undefined) {
        parts.push(["local", local, address.slice(0, at)]);
      }
      if (domain !== undefined) {
        parts.push(["domain", domain, address.slice(at + 1)]);
      }
      return { value: address, parts };
    },
    message,
    checks,
    [local, domain],
  );
  return formatted(validator, {
    kind: "format",
    format: "email",
    options,
    checks,
    ...(international && { international }),
  });
}

/**
 * Creates a validator for email addresses with a public domain name written in ASCII.
 *
 * @remarks
 * The value is the address as mail is delivered to it: the local part as written, and the domain in
 * lowercase, so `Ada@Example.COM` is `Ada@example.com`. A domain with a letter beyond ASCII, such as
 * `ada@münchen.de`, is refused, and so is one with a punycode label, `xn--`, which can only be told
 * valid by decoding it: `internationalEmail` reads both, and carries the code that does. The local part
 * must be a dot-atom, as HTML's email input accepts: ASCII letters, digits, the backtick and
 * `!#$%&'*+/=?^_{|}~-`, with single dots between them, so a quoted local part such as
 * `"a b"@example.com`, and addresses with letters beyond ASCII before the `@` (RFC 6531), are rejected.
 * Surrounding whitespace is not trimmed; trim first with `pipe` when the input may need it. The `domain`
 * and `local` options check those parts with validators of your own, which make the validator
 * asynchronous when one is. A part that fails is one `invalid_format` issue at the address's own place,
 * `{ format: "email", part, issues }`, so a form shows it beside the field, and the `message` option
 * words it.
 *
 * @example
 * ```ts
 * email()("Ada@Example.COM"); // { ok: true, value: "Ada@example.com" }
 * email()("ada@localhost"); // { ok: false, error: { issues: [{ code: "invalid_format", ... }] } }
 * email({ domain: oneOf(["company.com"]), message: "Use your company address" });
 * ```
 *
 * @returns A validator that produces the address, its domain in lowercase.
 * @throws {TypeError} When `domain` or `local` is not a validator, or `allowPlus` is not a boolean.
 */
export function email(...checks: Check<string>[]): Schema<string, string>;
export function email<const TOptions extends EmailOptions>(
  options: TOptions,
  ...checks: Check<string>[]
): Composed<EmailParts<TOptions>, string, string>;
export function email(...checks: AsyncCheck<string>[]): AsyncSchema<string, string>;
export function email(options: EmailOptions, ...checks: AsyncCheck<string>[]): AsyncSchema<string, string>;
export function email(...rest: unknown[]): AnyValidator {
  return emailOf(rest, toPlainEmailAddress);
}
