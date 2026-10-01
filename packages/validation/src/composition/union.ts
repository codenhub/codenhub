import { chain, type Maybe } from "../core/async";
import { tail } from "../core/checks";
import { assertFunction, assertList, issue } from "../core/result";
import type {
  AnyValidator,
  AsyncRest,
  AsyncValidator,
  Composed,
  Infer,
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
 * order, the issues that option found; their paths are relative to the value the union received.
 * For objects that share a tag property, `tagged` reports the failing variant's own
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
): Composed<TOptions[number], Infer<TOptions[number]>>;
export function union<const TOptions extends readonly [AnyValidator, ...AnyValidator[]]>(
  options: TOptions,
  ...rest: AsyncRest<Infer<TOptions[number]>, MessageOptions>
): AsyncValidator<Infer<TOptions[number]>>;
export function union(options: readonly AnyValidator[], ...rest: unknown[]): AnyValidator {
  assertList("options", options);
  // Copied, so changing the list after the validator is made changes nothing.
  const tried = [...options];
  if (tried.length === 0) {
    // The types forbid it, but a union of nothing would reject every value without saying why.
    throw new TypeError("union() needs at least one option");
  }
  tried.forEach((option, index) => assertFunction(`options[${index}]`, option));
  const [, reject, accept] = tail<MessageOptions, unknown>(rest);
  return (input: unknown): Maybe<ValidationResult<unknown>> => {
    const found: (readonly ValidationIssue[])[] = [];
    const attempt = (index: number): Maybe<ValidationResult<unknown>> =>
      index === tried.length
        ? reject([issue("invalid_union", { issues: found })])
        : chain((tried[index] as AnyValidator)(input), (result) => {
            if (result.ok) {
              return accept(result.value);
            }
            found.push(result.error.issues);
            return attempt(index + 1);
          });
    return attempt(0);
  };
}
