import type { Maybe } from "../core/async";
import { failWith, invalidType, pass } from "../core/result";
import type { AnyValidator, Composed, Infer, ValidationResult } from "../core/types";
import { settle } from "./settle";
import { assertSizeOptions, sizeIssues, type SizeOptions } from "./size";

/**
 * Creates a validator for `Set`s whose every value passes `element`.
 *
 * @remarks
 * A wrong size is reported at once, without validating the values. Otherwise every value is
 * validated, and each issue's path leads through the value's position in iteration order. The
 * output is a new `Set` of the validated values, so if `element` changes values, two that become
 * equal are stored once. It is synchronous when `element` is, and asynchronous otherwise.
 *
 * @example
 * ```ts
 * const ids = set(number({ int: true }), { min: 1 });
 * ids(new Set([1, 2])); // { ok: true, value: Set { 1, 2 } }
 * ids(new Set()); // { ok: false, ... }, code "too_small"
 * ```
 *
 * @typeParam TElement - The validator for each value.
 * @param element - Validator applied to every value.
 * @param options - Size limits.
 * @returns A validator that produces a `Set` of what `element` produces.
 * @throws {RangeError} When `min`, `max` or `length` is not a non-negative integer, or no size satisfies them together.
 */
export function set<TElement extends AnyValidator>(
  element: TElement,
  options: SizeOptions = {},
): Composed<TElement, Set<Infer<TElement>>> {
  assertSizeOptions(options);
  const validate = (input: unknown): Maybe<ValidationResult<unknown>> => {
    if (!(input instanceof Set)) {
      return invalidType("set", input);
    }
    const oversize = sizeIssues(input.size, "set", options);
    if (oversize.length > 0) {
      return failWith(oversize);
    }
    return settle(
      [...(input as Set<unknown>)].map((value) => element(value)),
      (values) => pass(new Set(values)),
    );
  };
  return validate as unknown as Composed<TElement, Set<Infer<TElement>>>;
}
