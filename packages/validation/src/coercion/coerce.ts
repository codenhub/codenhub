import type { Maybe } from "../core/async";
import { word } from "../core/checks";
import { described } from "../core/describe";
import { describeType, failWith, issue } from "../core/result";
import type { AnyValidator, Message, ValidationResult } from "../core/types";

/**
 * Builds a coercing validator: `convert` returns the converted input in a one-item list, or undefined
 * when it cannot convert it, and `strict`, the strict validator made from the same arguments, checks
 * what it converted. Input it cannot convert fails with `invalid_type` and `coerced: true`, worded by
 * the options' `message`. `own` holds the options that are the coercion's and not the strict validator's,
 * which its description gives as `options`.
 */
export function coercing<T>(
  expected: string,
  strict: AnyValidator<T>,
  args: readonly unknown[],
  convert: (input: unknown) => [unknown] | undefined,
  own?: object,
): (input: unknown) => Maybe<ValidationResult<T>> {
  const [first] = args;
  const message = typeof first === "object" ? (first as { message?: Message } | null)?.message : undefined;
  return described(
    (input: unknown) => {
      const converted = convert(input);
      return converted === undefined
        ? failWith(word([issue("invalid_type", { expected, received: describeType(input), coerced: true })], message))
        : strict(converted[0]);
    },
    own === undefined
      ? { kind: "coerce", inner: strict }
      : { kind: "coerce", inner: strict, options: Object.freeze(own) },
  );
}
