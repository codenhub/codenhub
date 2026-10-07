import { chain, type Maybe } from "../core/async";
import { describe } from "../core/describe";
import { call, composed } from "../core/nesting";
import { assertFunction, pass } from "../core/result";
import type { AnyValidator, AsyncCheck, Infer, InferInput, ValidationResult, Validator } from "../core/types";
import { unknown } from "../primitives/unknown";
import { array } from "./array";
import { intersection } from "./intersection";
import { lazy } from "./lazy";
import { map } from "./map";
import { nullable } from "./nullable";
import { nullish } from "./nullish";
import { object, type Shape } from "./object";
import { objectLike } from "./object-like";
import { optional } from "./optional";
import { pipe } from "./pipe";
import { record as recordOf } from "./record";
import { set } from "./set";
import { tagged } from "./tagged";
import { transform } from "./transform";
import { tuple } from "./tuple";
import { union } from "./union";

/** The result of `encode`: ready for a synchronous validator, and to be awaited for an asynchronous one. */
export type Encoded<TValidator extends AnyValidator> = [TValidator] extends [Validator<unknown>]
  ? ValidationResult<InferInput<TValidator>>
  : ValidationResult<InferInput<TValidator>> | PromiseLike<ValidationResult<InferInput<TValidator>>>;

type Make = (...args: unknown[]) => AnyValidator;

/** The kinds that produce a value they accept, so writing one back is validating it. */
const PRODUCE_WHAT_THEY_ACCEPT = new Set([
  "string",
  "number",
  "bigint",
  "boolean",
  "date",
  "symbol",
  "unknown",
  "never",
  "function",
  "literal",
  "oneOf",
  "instance",
  "guard",
  "format",
  "coerce",
]);

/** Writes the object `searchParams` read back as a query string, each value as text. */
function toQuery(value: unknown): string {
  const query = new URLSearchParams();
  for (const [key, each] of Object.entries(value as Record<string, unknown>)) {
    for (const item of Array.isArray(each) ? each : [each]) {
      if (item !== undefined) {
        query.append(key, String(item));
      }
    }
  }
  return query.toString();
}

/**
 * Writes a value back to what a validator accepts: a `Date` back to the text a `codec` read it from, an
 * object of them back to an object of text, and the object `json` parsed back to JSON.
 *
 * @remarks
 * The validator is read with `describe`, and each part written back as its kind says:
 *
 * - A `codec` validates the value with its output, runs its `encode`, and checks its input accepts the result.
 * - A part that produces what it accepts, such as `string`, a format or a coercion, validates the value and
 *   gives what it produced, so `email()` gives the address as the parser reads it.
 * - A composer, such as `object`, `array` or `union`, writes back each of its parts and keeps its options,
 *   and runs its checks on the value once its parts passed. A `pipe` writes its steps back from the last.
 * - `json` and `searchParams` write the text: JSON, and a query string of each value as text.
 *
 * So a value the validator could not have produced fails with the issues it has, at their paths. A part
 * that cannot be written back throws a `TypeError` naming its place: a `transform`, whose function goes one
 * way, and a validator written by hand; use a `codec` there. A coercion writes back the value it produced,
 * which it accepts, so inside `json` a `bigint` from `coerceBigint` cannot be written as JSON: use a codec
 * that writes it as text.
 *
 * @example
 * ```ts
 * const timestamp = codec(datetime(), date(), {
 *   decode: (text) => new Date(text),
 *   encode: (value) => value.toISOString(),
 * });
 * const event = object({ name: string(), at: timestamp });
 * encode(event, { name: "Launch", at: new Date(0) }); // { ok: true, value: { name: "Launch", at: "1970-01-01T00:00:00.000Z" } }
 * ```
 *
 * @typeParam TValidator - The validator to write the value back for.
 * @param validator - A validator made by the factories of this package.
 * @param value - A value of the type the validator produces.
 * @returns The value as the validator accepts it, or every issue found.
 * @throws {TypeError} When `validator` is not a function, or a part of it cannot be written back.
 */
export function encode<TValidator extends AnyValidator>(
  validator: TValidator,
  value: Infer<TValidator>,
): Encoded<TValidator> {
  assertFunction("validator", validator);
  // The encoder of each validator met, so a recursive schema is written back by one encoder at each level.
  const made = new Map<AnyValidator, AnyValidator>();

  const refuse = (what: string, path: string): never => {
    throw new TypeError(`encode cannot write back ${what} at ${path === "" ? "the root" : path}. Use a codec there`);
  };

  /** Runs `checks`, written for the value as it was given, once `encoded` passed. */
  const checked = (encoded: AnyValidator, checks: readonly AsyncCheck<never>[] | undefined): AnyValidator => {
    if (checks === undefined || checks.length === 0) {
      return encoded;
    }
    const rules = (unknown as Make)(...checks);
    return composed((given, place) =>
      chain(
        call(encoded, given, place),
        (result): Maybe<ValidationResult<unknown>> =>
          result.ok ? chain(call(rules, given, place), (ruled) => (ruled.ok ? result : ruled)) : result,
      ),
    ) as AnyValidator;
  };

  const encoderOf = (target: AnyValidator, path: string): AnyValidator => {
    const known = made.get(target);
    if (known !== undefined) {
      return known;
    }
    const encoder = build(target, path);
    made.set(target, encoder);
    return encoder;
  };

  const build = (target: AnyValidator, path: string): AnyValidator => {
    const record = describe(target);
    if (record === undefined) {
      return refuse("a validator written by hand", path);
    }
    if (PRODUCE_WHAT_THEY_ACCEPT.has(record.kind)) {
      return target;
    }
    const options = record.options ?? {};
    const part = (name: string, at = path): AnyValidator => encoderOf(record[name] as AnyValidator, at);
    const parts = (name: string): AnyValidator[] =>
      (record[name] as AnyValidator[]).map((each) => encoderOf(each, path));
    const shape = (): Shape =>
      Object.fromEntries(
        Object.entries(record["shape"] as Shape).map(([key, each]) => [
          key,
          encoderOf(each, path === "" ? key : `${path}.${key}`),
        ]),
      );
    const over = (encoded: AnyValidator): AnyValidator => checked(encoded, record.checks);

    switch (record.kind) {
      case "codec": {
        const { input, output } = record as unknown as { input: AnyValidator; output: AnyValidator };
        const write = record["encode"] as (value: unknown) => unknown;
        return composed((given, place) =>
          chain(call(output, given, place), (produced): Maybe<ValidationResult<unknown>> => {
            if (!produced.ok) {
              return produced;
            }
            const written = write(produced.value);
            return chain(call(input, written, place), (read) => (read.ok ? pass(written) : read));
          }),
        ) as AnyValidator;
      }
      case "object":
        return over((object as Make)(shape(), options));
      case "objectLike":
        return over((objectLike as Make)(shape(), options));
      case "array":
        return over((array as Make)(part("item", `${path}[]`), options));
      case "set":
        return over((set as Make)(part("item", `${path}[]`), options));
      case "map":
        return over((map as Make)(part("key", `${path}{}`), part("value", `${path}{}`), options));
      case "record":
        return over((recordOf as Make)(part("key", `${path}{}`), part("value", `${path}{}`), options));
      case "tuple": {
        const items = (record["items"] as AnyValidator[]).map((each, index) => encoderOf(each, `${path}[${index}]`));
        const rest = record["rest"] === undefined ? {} : { rest: part("rest", `${path}[]`) };
        return over((tuple as Make)(items, { ...options, ...rest }));
      }
      case "union":
        return over((union as Make)(parts("members"), options));
      case "intersection":
        return over((intersection as Make)(...parts("members"), options));
      case "tagged": {
        const variants = Object.fromEntries(
          Object.entries(record["variants"] as Shape).map(([tag, variant]) => [tag, encoderOf(variant, path)]),
        );
        return over((tagged as Make)(record["key"], variants, options));
      }
      case "optional":
        return (optional as Make)(part("inner"));
      case "nullable":
        return (nullable as Make)(part("inner"));
      case "nullish":
        return (nullish as Make)(part("inner"));
      case "readonly":
      case "fallback":
      case "meta":
        return part("inner");
      case "pipe": {
        // Each step reads what the one before produced, so the steps are written back from the last.
        const steps = (record["steps"] as AnyValidator[]).map((step) => encoderOf(step, path)).toReversed();
        return (pipe as Make)(...steps);
      }
      case "lazy": {
        const getter = record["getter"] as () => AnyValidator;
        // The validator the getter returns is met again at every level, and has one encoder.
        return over((lazy as Make)(() => encoderOf(getter(), path), options));
      }
      case "json": {
        const inner = record["inner"] === undefined ? (unknown as Make)() : part("inner");
        return (transform as Make)(over(inner), (written: unknown) => JSON.stringify(written));
      }
      case "searchParams":
        return (transform as Make)(over(part("inner")), toQuery);
      case "transform":
        return refuse("a transform", path);
      default:
        return refuse(`a validator of kind "${record.kind}"`, path);
    }
  };

  return encoderOf(validator, "")(value) as Encoded<TValidator>;
}
