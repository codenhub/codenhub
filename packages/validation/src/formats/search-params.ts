import { chain, type Maybe } from "../core/async";
import { tail } from "../core/checks";
import { queryOf } from "../core/objects";
import { assertFunction, assertOption, typeIssue } from "../core/result";
import type {
  AnyValidator,
  AsyncRest,
  AsyncValidator,
  Composed,
  Infer,
  MessageOptions,
  Rest,
  ValidationResult,
} from "../core/types";
import { readQuery } from "./parts";

/** Options for {@link searchParams}. */
export interface SearchParamsOptions extends MessageOptions {
  /**
   * Gives the validator every value of every key as an array, and accepts a key given more than once.
   *
   * @defaultValue false
   */
  repeated?: boolean;
}

/**
 * Creates a validator that reads a query string, or a `URLSearchParams`, into an object of its decoded
 * parameters, and validates that object: each key's value as a string, or with `repeated` every value
 * of every key as an array. The value is what the validator produces, so values can be converted as
 * they are read.
 *
 * @remarks
 * The parameters are read as `URLSearchParams` reads them, `+` as a space and escapes decoded, and a
 * leading `?` is ignored. A `URLSearchParams` from another realm, such as an iframe, is read too. A key given more than once fails, at its path with `invalid_key`, unless
 * `repeated` is set: a check that saw one of two values while a server read the other would pass a
 * value nobody checked. It is the reading `url` gives its `query` option.
 *
 * @example
 * ```ts
 * const filters = searchParams(object({ page: coerceNumber({ int: true, min: 1 }), q: optional(string()) }));
 * filters("?page=2&q=shoes"); // { ok: true, value: { page: 2, q: "shoes" } }
 * filters("page=1&page=2"); // { ok: false, ... }, a repeated key
 * searchParams(object({ tag: array(string()) }), { repeated: true })("tag=a&tag=b"); // { tag: ["a", "b"] }
 * ```
 *
 * @typeParam TValidator - The validator of the parameters.
 * @param validator - Validates the object of parameters.
 * @param rest - Options, then checks, which run on what the validator produced.
 * @returns A validator that produces what `validator` produces.
 * @throws {TypeError} When `validator` or a check is not a function, or `repeated` is not a boolean.
 */
export function searchParams<TValidator extends AnyValidator>(
  validator: TValidator,
  ...rest: Rest<Infer<TValidator>, SearchParamsOptions>
): Composed<TValidator, Infer<TValidator>>;
export function searchParams<TValidator extends AnyValidator>(
  validator: TValidator,
  ...rest: AsyncRest<Infer<TValidator>, SearchParamsOptions>
): AsyncValidator<Infer<TValidator>>;
export function searchParams(validator: AnyValidator, ...rest: unknown[]): AnyValidator {
  assertFunction("validator", validator);
  const [{ repeated = false }, reject, accept] = tail<SearchParamsOptions, unknown>(rest);
  assertOption("repeated", repeated, "boolean");
  return (input: unknown): Maybe<ValidationResult<unknown>> => {
    // A `URLSearchParams` is read as its text, so one from another realm is read as one from this.
    const query = typeof input === "string" ? input : queryOf(input);
    if (query === undefined) {
      return reject([typeIssue("query string", input)]);
    }
    const { value, issues } = readQuery(new URLSearchParams(query), repeated);
    if (issues.length > 0) {
      return reject(issues);
    }
    return chain(validator(value), (result: ValidationResult<unknown>) => (result.ok ? accept(result.value) : result));
  };
}
