import type { AnyValidator, Composed, Infer } from "../core/types";

/**
 * Creates a validator that looks up another validator the first time it runs, so a validator can
 * refer to itself for recursive data such as a tree or a comment thread.
 *
 * @remarks
 * TypeScript cannot infer a validator that refers to itself, so annotate the variable with the type
 * it produces. The getter runs once and its result is reused.
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
 * @returns A validator that behaves as the one the getter returns.
 */
export function lazy<TValidator extends AnyValidator>(
  getter: () => TValidator,
): Composed<TValidator, Infer<TValidator>> {
  let resolved: TValidator | undefined;
  const validate = (input: unknown) => (resolved ??= getter())(input);
  return validate as Composed<TValidator, Infer<TValidator>>;
}
