import { chain, isThenable, type Maybe } from "../core/async";
import { tail } from "../core/checks";
import { described } from "../core/describe";
import { composed, fastOf, MISS, type Fast } from "../core/nesting";
import { assertFunction, assertList, isResult, issue, nested, notResult } from "../core/result";
import type {
  AnyValidator,
  AsyncRest,
  AsyncValidator,
  Composed,
  Infer,
  InferInput,
  MessageOptions,
  Rest,
  ValidationIssue,
  ValidationResult,
} from "../core/types";

/**
 * Creates a validator that accepts a value passing any one of several validators.
 *
 * @remarks
 * The validators are tried in order and the first that accepts the value wins, so put the more
 * specific ones first, and the value it produced is the result. If none accepts it, the result is
 * one `invalid_union` issue at the value's own location whose `params.issues` lists, per option in
 * order, the issues that option found; their paths are relative to the value the union received. An
 * issue an option found that carries issues of its own, such as another union's, is held without them
 * when one of those carries more, so the result of a recursive union stays as small as its input; a limit
 * of `lazy` found behind it stands in its place. For objects that share a tag property, `tagged` reports the failing variant's own
 * issues instead. It is synchronous when every option is, and asynchronous otherwise.
 *
 * @example
 * ```ts
 * const id = union([string({ min: 1 }), number({ int: true })]);
 * id("a1"); // { ok: true, value: "a1" }
 * id(7); // { ok: true, value: 7 }
 * id(true); // { ok: false, ... }, code "invalid_union"
 * ```
 *
 * @typeParam TOptions - The validators to try, at least one.
 * @param options - The validators to try, in order.
 * @returns A validator that produces what the first accepting option produces.
 * @throws {TypeError} When `options` is not a list, is empty, or holds an option that is not a function.
 */
export function union<const TOptions extends readonly [AnyValidator, ...AnyValidator[]]>(
  options: TOptions,
  ...rest: Rest<Infer<TOptions[number]>, MessageOptions>
): Composed<TOptions[number], Infer<TOptions[number]>, InferInput<TOptions[number]>>;
export function union<const TOptions extends readonly [AnyValidator, ...AnyValidator[]]>(
  options: TOptions,
  ...rest: AsyncRest<Infer<TOptions[number]>, MessageOptions>
): AsyncValidator<Infer<TOptions[number]>, InferInput<TOptions[number]>>;
export function union(options: readonly AnyValidator[], ...rest: unknown[]): AnyValidator {
  assertList("options", options);
  // Copied, so changing the list after the validator is made changes nothing.
  const tried = [...options];
  if (tried.length === 0) {
    // The types forbid it, but a union of nothing would reject every value without saying why.
    throw new TypeError("union() needs at least one option");
  }
  tried.forEach((option, index) => assertFunction(`options[${index}]`, option));
  const [settings, reject, accept, checks] = tail<MessageOptions, unknown>(rest);

  // Valid input is answered by the first option whose fast test passes it, when every option has one. A
  // fast test misses only where its validator fails, so that option is the first the full work accepts.
  const fastOptions = tried.map(fastOf);
  const fast: Fast | undefined =
    checks.length > 0 || fastOptions.includes(undefined)
      ? undefined
      : (input) => {
          for (const option of fastOptions) {
            const value = (option as Fast)(input);
            if (value !== MISS) {
              return value;
            }
          }
          return MISS;
        };

  return described(
    composed((input, place): Maybe<ValidationResult<unknown>> => {
      const found: (readonly ValidationIssue[])[] = [];
      // Tried in a loop while the results are ready, and not by one call inside another: every option that
      // failed would stay on the stack while the next ran, so a recursive union of twenty options overflowed
      // it inside the default depth of `lazy`. Each option is called on its own, so what it found is relative
      // to the value, as `params.issues` holds it.
      const attempt = (start: number): Maybe<ValidationResult<unknown>> => {
        for (let index = start; index < tried.length; index += 1) {
          const result = (tried[index] as AnyValidator)(input);
          if (isThenable(result)) {
            return chain(result, (settled) => {
              if (!isResult(settled)) {
                throw notResult(`options[${index}]`);
              }
              if (settled.ok) {
                return accept(settled.value, place);
              }
              found.push(settled.error.issues.map(nested));
              return attempt(index + 1);
            });
          }
          // A mistake in the schema, such as `string` for `string()`, named by its option.
          if (!isResult(result)) {
            throw notResult(`options[${index}]`);
          }
          if (result.ok) {
            return accept(result.value, place);
          }
          found.push(result.error.issues.map(nested));
        }
        return reject([issue("invalid_union", { issues: found })], place);
      };
      return attempt(0);
    }, fast),
    { kind: "union", options: settings, checks, members: Object.freeze(tried) },
  );
}
