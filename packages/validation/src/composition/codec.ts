import { chain, decided, type Maybe } from "../core/async";
import { described } from "../core/describe";
import { call, composed } from "../core/nesting";
import { isPlainObject } from "../core/objects";
import { assertFunction } from "../core/result";
import type { AnyValidator, Composed, Infer, InferInput, ValidationResult } from "../core/types";

/**
 * The two functions of a {@link codec}: one that turns what `input` produced into what `output` reads,
 * and one that turns what `output` produced back into what `input` reads.
 *
 * @typeParam TInput - The validator of the value as it is sent.
 * @typeParam TOutput - The validator of the value as a program uses it.
 */
export interface Conversions<TInput extends AnyValidator, TOutput extends AnyValidator> {
  /** From the value as it is sent, once `input` passed it, to the value `output` validates. */
  readonly decode: (value: Infer<TInput>) => InferInput<TOutput>;
  /** From the value as a program uses it, once `output` passed it, to the value `input` validates. */
  readonly encode: (value: Infer<TOutput>) => InferInput<TInput>;
}

/**
 * Creates a validator that reads a value as it is sent, such as text, into the value a program uses, such
 * as a `Date`, and that `encode` can write back.
 *
 * @remarks
 * It validates with `input`, gives what that produced to `decode`, and validates the result with
 * `output`, so both ends are checked: `"2026-02-30"` fails the input, and a `decode` that returns an
 * invalid date fails the output. `encode(validator, value)` runs the other way, through `encode`: it
 * validates the value with `output`, gives what that produced to `encode`, and checks `input` accepts the
 * result. Each function is written for one direction, and a pair of them is what lets a value go back.
 *
 * An exception thrown by either function propagates, as a `transform`'s does: it is a bug, not invalid
 * input. Return a value the other validator refuses instead, to fail. Both functions are synchronous: one
 * that returns a promise throws a `TypeError`, since the validator would wait while typed as not waiting,
 * so a rule that waits goes in a check. It is synchronous when both validators are.
 *
 * @example
 * ```ts
 * const timestamp = codec(datetime(), date(), {
 *   decode: (text) => new Date(text),
 *   encode: (value) => value.toISOString(),
 * });
 * timestamp("2026-10-07T12:00:00Z"); // { ok: true, value: Date }
 * encode(timestamp, new Date(0)); // { ok: true, value: "1970-01-01T00:00:00.000Z" }
 * ```
 *
 * @typeParam TInput - The validator of the value as it is sent.
 * @typeParam TOutput - The validator of the value as a program uses it.
 * @param input - Validates the value as it is sent.
 * @param output - Validates the value as a program uses it.
 * @param conversions - `decode` and `encode`, each a function of one direction.
 * @returns A validator that produces what `output` produces, from what `input` accepts.
 * @throws {TypeError} When `input` or `output` is not a function, `conversions` is not a plain object, or
 * its `decode` or `encode` is not a function; and when validating, if `decode` returns a promise.
 */
export function codec<TInput extends AnyValidator, TOutput extends AnyValidator>(
  input: TInput,
  output: TOutput,
  conversions: Conversions<TInput, TOutput>,
): Composed<TInput | TOutput, Infer<TOutput>, InferInput<TInput>> {
  assertFunction("input", input);
  assertFunction("output", output);
  if (!isPlainObject(conversions)) {
    throw new TypeError("conversions must be an object with decode and encode");
  }
  const { decode, encode } = conversions;
  assertFunction("decode", decode);
  assertFunction("encode", encode);
  const validate = composed((given, place) =>
    chain(
      call(input, given, place),
      (read): Maybe<ValidationResult<unknown>> =>
        read.ok
          ? call(output, decided("codec", decode as (value: unknown) => unknown, read.value, "decode"), place)
          : read,
    ),
  );
  return described(validate, { kind: "codec", input, output, decode, encode }) as unknown as Composed<
    TInput | TOutput,
    Infer<TOutput>,
    InferInput<TInput>
  >;
}
