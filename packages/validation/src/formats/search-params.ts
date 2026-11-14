import { runOf, toolsOf } from "../core/child";
import { endOf, waitsOf } from "../core/finish";
import { toValidator } from "../core/make";
import { queryOf } from "../core/objects";
import { assertOption } from "../core/result";
import { count, FAIL, refuse, type Run } from "../core/run";
import { split } from "../core/split";
import type { AnyValidator, AsyncRest, AsyncSchema, Composed, Infer, MessageOptions, Rest } from "../core/types";
import { wordKey, wordSize, wordType } from "../core/words";
import { readEntries } from "./parts";

/** Options for {@link searchParams}. */
export interface SearchParamsOptions extends MessageOptions {
  /**
   * Gives the validator every value of every key as an array, and accepts a key given more than once.
   *
   * @defaultValue false
   */
  repeated?: boolean | undefined;
}

/**
 * Creates a validator that reads a query string, or a `URLSearchParams`, into an object of its decoded
 * parameters, and validates that object: each key's value as a string, or with `repeated` every value
 * of every key as an array. The value is what the validator produces, so values can be converted as
 * they are read.
 *
 * @remarks
 * The parameters are read as `URLSearchParams` reads them, `+` as a space and escapes decoded, and a
 * leading `?` is ignored. A `URLSearchParams` from another realm, such as an iframe, is read too. A key given more than once fails, at its path with `invalid_key`, up to the 1,000 issues a collection reports, unless
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
 * @throws {TypeError} When `validator` is not a validator of this copy of the package, a check was not made by `check`, `checkFields` or a built-in check, or `repeated` is not a boolean.
 */
export function searchParams<TValidator extends AnyValidator>(
  validator: TValidator,
  ...rest: Rest<Infer<TValidator>, SearchParamsOptions>
): Composed<TValidator, Infer<TValidator>, string | Iterable<[string, string]>>;
export function searchParams<TValidator extends AnyValidator>(
  validator: TValidator,
  ...rest: AsyncRest<Infer<TValidator>, SearchParamsOptions>
): AsyncSchema<Infer<TValidator>, string | Iterable<[string, string]>>;
export function searchParams(validator: AnyValidator, ...rest: unknown[]): AnyValidator {
  const runInner = runOf(validator, "validator");
  const [options, checks] = split<SearchParamsOptions, unknown>(rest, "repeated");
  const { repeated = false, message } = options;
  assertOption("repeated", repeated, "boolean");
  const tools = toolsOf([runInner], waitsOf(checks));
  const end = endOf(checks, message, tools);
  const run: Run = (input) => {
    // A `URLSearchParams` is read as its text, so one from another realm is read as one from this.
    const query = typeof input === "string" ? input : queryOf(input);
    const entries = query === undefined ? undefined : new URLSearchParams(query);
    if (entries === undefined) {
      return refuse("query string", input, message);
    }
    const start = count();
    const value = readEntries(entries, repeated, message);
    return count() > start ? FAIL : end(runInner(value));
  };
  run.w = tools;
  return toValidator(
    run,
    { kind: "searchParams", options, checks, inner: validator },
    [wordType, wordKey, wordSize],
    [validator],
  );
}
