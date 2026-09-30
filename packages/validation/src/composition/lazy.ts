import { chain } from "../core/async";
import { tail } from "../core/checks";
import { assertFunction, issue } from "../core/result";
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

/** Options for {@link lazy}. */
export interface LazyOptions extends MessageOptions {
  /**
   * The most levels of `lazy` that may be open at once, counting every `lazy` validator, not only this
   * one. Input nested deeper fails with `too_big` instead of exhausting the stack. Since the levels of
   * every `lazy` count, a `maxDepth` of 1 inside another `lazy` fails at once: set it for the whole
   * nesting.
   *
   * @defaultValue 128
   */
  maxDepth?: number;
}

const DEFAULT_MAX_DEPTH = 128;

/**
 * How many `lazy` calls are running right now. It only counts calls that are still on the stack:
 * one that returned a promise is finished as far as the stack is concerned, and its continuation
 * starts from a shallow one. That is the depth that can overflow.
 */
let openDepth = 0;

/**
 * Creates a validator that looks up another validator the first time it runs, so a validator can
 * refer to itself for recursive data such as a tree or a comment thread.
 *
 * @remarks
 * TypeScript cannot infer a validator that refers to itself, so annotate the variable with the type
 * it produces. The getter runs once and its result is reused.
 *
 * Every level of nesting is a level of recursion, and input nested past the stack, or a cyclic
 * object, would throw. `maxDepth` stops that first: a value found more than that many levels down
 * fails with `too_big` and `{ maximum, type: "depth" }` at its own path, so untrusted input can be
 * checked without a size cap tuned to the stack. The count is of calls on the stack, so it bounds
 * recursion that happens in one synchronous run, which is where the stack can overflow; a rule that
 * awaits between levels starts the next from a fresh stack, and is not counted. So `maxDepth` does not
 * bound an asynchronous recursive schema: it follows input of any depth, and a cyclic object until
 * memory runs out. Give such a schema a bound of its own.
 *
 * @example
 * ```ts
 * interface Category {
 *   name: string;
 *   children: Category[];
 * }
 *
 * const category: Validator<Category> = object({
 *   name: string(),
 *   children: array(lazy(() => category)),
 * });
 * ```
 *
 * @typeParam TValidator - The validator the getter returns.
 * @param getter - Returns the validator. Called once, on first use.
 * @param options - The depth limit.
 * @returns A validator that behaves as the one the getter returns.
 * @throws {TypeError} When `getter` is not a function, and, from the returned validator on its first
 * use, when `getter` returns something that is not a function.
 * @throws {RangeError} When `maxDepth` is not a positive integer.
 */
export function lazy<TValidator extends AnyValidator>(
  getter: () => TValidator,
  ...rest: Rest<Infer<TValidator>, LazyOptions>
): Composed<TValidator, Infer<TValidator>>;
export function lazy<TValidator extends AnyValidator>(
  getter: () => TValidator,
  ...rest: AsyncRest<Infer<TValidator>, LazyOptions>
): AsyncValidator<Infer<TValidator>>;
export function lazy(getter: () => AnyValidator, ...rest: unknown[]): AnyValidator {
  assertFunction("getter", getter);
  const [options, reject, accept] = tail<LazyOptions, unknown>(rest);
  const { maxDepth = DEFAULT_MAX_DEPTH } = options;
  if (!Number.isInteger(maxDepth) || maxDepth < 1) {
    throw new RangeError(`maxDepth must be a positive integer, received ${maxDepth}`);
  }
  let resolved: AnyValidator | undefined;
  return (input: unknown) => {
    if (openDepth >= maxDepth) {
      return reject([issue("too_big", { maximum: maxDepth, type: "depth" })]);
    }
    openDepth += 1;
    try {
      if (resolved === undefined) {
        const found: unknown = getter();
        if (typeof found !== "function") {
          throw new TypeError(`getter() must return a function, received ${found === null ? "null" : typeof found}`);
        }
        resolved = found as AnyValidator;
      }
      return chain(resolved(input), (result: ValidationResult<unknown>) => (result.ok ? accept(result.value) : result));
    } finally {
      openDepth -= 1;
    }
  };
}
