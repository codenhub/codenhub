import { failIssue } from "../core/result";
import type { AnyValidator, Composed, Infer } from "../core/types";

/** Options for {@link lazy}. */
export interface LazyOptions {
  /**
   * The most levels of `lazy` that may be open at once, counting every `lazy` validator, not only this
   * one. Input nested deeper fails with `too_big` instead of exhausting the stack.
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
 * awaits between levels starts the next from a fresh stack, and is not counted.
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
 * @throws {RangeError} When `maxDepth` is not a positive integer.
 */
export function lazy<TValidator extends AnyValidator>(
  getter: () => TValidator,
  options: LazyOptions = {},
): Composed<TValidator, Infer<TValidator>> {
  const { maxDepth = DEFAULT_MAX_DEPTH } = options;
  if (!Number.isInteger(maxDepth) || maxDepth < 1) {
    throw new RangeError(`maxDepth must be a positive integer, received ${maxDepth}`);
  }
  let resolved: TValidator | undefined;
  const validate = (input: unknown) => {
    if (openDepth >= maxDepth) {
      return failIssue("too_big", { maximum: maxDepth, type: "depth" });
    }
    openDepth += 1;
    try {
      return (resolved ??= getter())(input);
    } finally {
      openDepth -= 1;
    }
  };
  return validate as Composed<TValidator, Infer<TValidator>>;
}
