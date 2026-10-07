import { chain } from "../core/async";
import { tail } from "../core/checks";
import { described } from "../core/describe";
import { call, composed } from "../core/nesting";
import { assertFunction, issue, pass, typeIssue } from "../core/result";
import type {
  AnyValidator,
  AsyncRest,
  AsyncValidator,
  Composed,
  Infer,
  MessageOptions,
  Rest,
  ValidationResult,
  Validator,
} from "../core/types";

/**
 * Creates a validator for text that holds JSON: it parses the text, then optionally validates what
 * was parsed.
 *
 * @remarks
 * A non-string fails with `invalid_type`, and text that is not valid JSON fails with
 * `invalid_format` and `{ format: "json" }`. Issues from `validator` have paths relative to the
 * parsed value. Objects parsed from JSON are plain objects, so a `__proto__` key is data. Without
 * `validator` the result is `unknown`.
 *
 * @example
 * ```ts
 * const settings = json(object({ theme: oneOf(["light", "dark"]) }));
 * settings('{"theme":"dark"}'); // { ok: true, value: { theme: "dark" } }
 * settings("{oops"); // { ok: false, ... }, code "invalid_format"
 * ```
 *
 * @typeParam TValidator - The validator for the parsed value.
 * @param validator - Validates the parsed value.
 * @returns A validator that produces what `validator` produces, or `unknown` without one.
 * @throws {TypeError} When `validator` is given and is not a function, `undefined` included.
 */
export function json(): Validator<unknown>;
export function json(options: MessageOptions): Validator<unknown>;
export function json<TValidator extends AnyValidator>(
  validator: TValidator,
  ...rest: Rest<Infer<TValidator>, MessageOptions>
): Composed<TValidator, Infer<TValidator>>;
export function json<TValidator extends AnyValidator>(
  validator: TValidator,
  ...rest: AsyncRest<Infer<TValidator>, MessageOptions>
): AsyncValidator<Infer<TValidator>>;
export function json(...args: unknown[]): AnyValidator {
  // A function in first place is the validator of the parsed value, and an object or no argument at all
  // is the options. Anything else, such as an import that resolved to null or a key with no validator,
  // undefined, is a mistake in the schema, which would otherwise accept any JSON.
  const [first] = args;
  const isOptions = args.length === 0 || (typeof first === "object" && first !== null);
  const [validator, rest] = isOptions ? [pass as AnyValidator, args] : [first as AnyValidator, args.slice(1)];
  assertFunction("validator", validator);
  const [options, reject, accept, checks] = tail<MessageOptions, unknown>(rest);
  return described(
    composed((input, place) => {
      if (typeof input !== "string") {
        return reject([typeIssue("string", input)], place);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(input);
      } catch {
        return reject([issue("invalid_format", { format: "json" })], place);
      }
      return chain(call(validator, parsed, place), (result: ValidationResult<unknown>) =>
        result.ok ? accept(result.value, place) : result,
      );
    }),
    { kind: "json", options, checks, inner: validator },
  );
}
