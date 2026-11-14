import { runOf } from "../core/child";
import { toValidator } from "../core/make";
import { describeType } from "../core/result";
import { report, type Run } from "../core/run";
import type { AnyValidator, Message } from "../core/types";
import { TYPE_WORDS } from "../core/words";

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
): AnyValidator<T> {
  const [first] = args;
  const message = typeof first === "object" ? (first as { message?: Message } | null)?.message : undefined;
  const runStrict = runOf(strict, "strict");
  const run: Run = (input) => {
    const converted = convert(input);
    return converted === undefined
      ? report("invalid_type", { expected, received: describeType(input), coerced: true }, message)
      : runStrict(converted[0]);
  };
  run.w = runStrict.w;
  return toValidator(
    run,
    own === undefined
      ? { kind: "coerce", inner: strict }
      : { kind: "coerce", inner: strict, options: Object.freeze(own) },
    TYPE_WORDS,
    [strict],
  );
}
