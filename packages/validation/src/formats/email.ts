import { split } from "../core/checks";
import { described } from "../core/describe";
import { assertOption } from "../core/result";
import type {
  AnyValidator,
  AsyncCheck,
  AsyncValidator,
  Check,
  Composed,
  MessageOptions,
  Validator,
} from "../core/types";
import { toEmailAddress } from "./email-address";
import { assertParts, notFormat, partsFormat, type Part } from "./parts";

/** Options for {@link email}. */
export interface EmailOptions extends MessageOptions {
  /**
   * Accepts `+` in the local part, as in `me+tag@example.com`.
   *
   * @defaultValue true
   */
  allowPlus?: boolean | undefined;
  /**
   * Validates the domain instead of the default rule, that it is a public domain name. It receives the
   * domain as the URL parser reads it, lowercase ASCII with internationalized labels in punycode, and
   * the domain must still be a hostname: `email({ domain: hostname() })` accepts `ada@localhost`, and
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
type EmailParts<TOptions> = Extract<TOptions[keyof TOptions & ("domain" | "local")], AnyValidator>;

/**
 * Creates a validator for email addresses with a public domain name, which may be internationalized.
 *
 * @remarks
 * The value is the address as mail is delivered to it: the local part as written, and the domain as
 * the URL parser reads it, lowercase ASCII with internationalized labels in punycode. So
 * `Ada@München.DE` is `Ada@xn--mnchen-3ya.de`, and every spelling that names one domain, such as
 * fullwidth letters or an invisible variation selector, gives one address. The local part must be
 * ASCII: addresses with letters beyond it (RFC 6531) are rejected. Surrounding whitespace is not
 * trimmed; trim first with `pipe` when the input may need it. A domain written with more than 759
 * characters, three for each one a domain can have, is rejected before the parser reads it. The `domain` and `local` options check
 * those parts with validators of your own, which make the validator asynchronous when one is. A part
 * that fails is one `invalid_format` issue at the address's own place, `{ format: "email", part, issues }`,
 * so a form shows it beside the field, and the `message` option words it.
 *
 * @example
 * ```ts
 * email()("Ada@Example.COM"); // { ok: true, value: "Ada@example.com" }
 * email()("ada@localhost"); // { ok: false, error: { issues: [{ code: "invalid_format", ... }] } }
 * email({ domain: oneOf(["company.com"]), message: "Use your company address" });
 * ```
 *
 * @returns A validator that produces the address, its domain as the parser reads it.
 * @throws {TypeError} When `domain` or `local` is not a function, or `allowPlus` is not a boolean.
 */
export function email(...checks: Check<string>[]): Validator<string, string>;
export function email<const TOptions extends EmailOptions>(
  options: TOptions,
  ...checks: Check<string>[]
): Composed<EmailParts<TOptions>, string, string>;
export function email(...checks: AsyncCheck<string>[]): AsyncValidator<string, string>;
export function email(options: EmailOptions, ...checks: AsyncCheck<string>[]): AsyncValidator<string, string>;
export function email(...rest: unknown[]): AnyValidator {
  const [options, checks] = split<EmailOptions, string>(rest, "allowPlus domain local");
  const { allowPlus = true, domain, local, message } = options;
  assertOption("allowPlus", allowPlus, "boolean");
  assertParts({ domain, local });
  const validator = partsFormat(
    "email",
    (text) => {
      // A domain validator replaces the rule that the domain is public, never the rule that it is a host.
      const address = toEmailAddress(text, allowPlus, domain !== undefined);
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
  return described(validator, { kind: "format", format: "email", options, checks });
}
