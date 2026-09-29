import { chain, collect, type Maybe } from "../core/async";
import { collectNested, failWith, invalidType, pass, toIssue } from "../core/result";
import type { AnyValidator, Composed, Infer, ValidationIssue, ValidationResult } from "../core/types";
import { assertSizeOptions, sizeIssues, type SizeOptions } from "./size";

/**
 * Creates a validator for `Map`s whose every key passes `key` and every value passes `value`.
 *
 * @remarks
 * A wrong size is reported at once, without validating the entries. An issue's path ends at the
 * entry's key when it is a string or a number, and at its position in iteration order otherwise. A
 * key that fails is reported as one `invalid_key` issue whose `params.issues` holds what the key
 * validator found.
 * The output is a new `Map`. It is synchronous when both validators are, and asynchronous otherwise.
 *
 * @example
 * ```ts
 * const stock = map(string(), number({ int: true, min: 0 }));
 * stock(new Map([["apples", 3]])); // { ok: true, value: Map { "apples" => 3 } }
 * ```
 *
 * @typeParam TKey - The validator for keys.
 * @typeParam TValue - The validator for values.
 * @param key - Validator applied to every key.
 * @param value - Validator applied to every value.
 * @param options - Size limits.
 * @returns A validator that produces a `Map`.
 * @throws {RangeError} When `min`, `max` or `length` is not a non-negative integer, or no size satisfies them together.
 */
export function map<TKey extends AnyValidator, TValue extends AnyValidator>(
  key: TKey,
  value: TValue,
  options: SizeOptions = {},
): Composed<TKey | TValue, Map<Infer<TKey>, Infer<TValue>>> {
  assertSizeOptions(options);
  const validate = (input: unknown): Maybe<ValidationResult<unknown>> => {
    if (!(input instanceof Map)) {
      return invalidType("map", input);
    }
    const oversize = sizeIssues(input.size, "map", options);
    if (oversize.length > 0) {
      return failWith(oversize);
    }
    const entries = [...(input as Map<unknown, unknown>)];
    const segments = entries.map(([name], index) =>
      typeof name === "string" || typeof name === "number" ? name : index,
    );
    const results = entries.map(([name, item]) =>
      chain(key(name), (keyResult) => chain(value(item), (valueResult) => ({ keyResult, valueResult }))),
    );
    return chain(collect(results), (settled) => {
      const issues: ValidationIssue[] = [];
      const output = new Map<unknown, unknown>();
      settled.forEach(({ keyResult, valueResult }, index) => {
        const segment = segments[index] as string | number;
        if (!keyResult.ok) {
          // Wrapped, so a bad key is not mistaken for a bad value at the same path.
          issues.push(toIssue({ code: "invalid_key", path: [segment], params: { issues: keyResult.error.issues } }));
        }
        if (!valueResult.ok) {
          collectNested(issues, valueResult.error.issues, segment);
        }
        if (keyResult.ok && valueResult.ok) {
          output.set(keyResult.value, valueResult.value);
        }
      });
      return issues.length > 0 ? failWith(issues) : pass(output);
    });
  };
  return validate as unknown as Composed<TKey | TValue, Map<Infer<TKey>, Infer<TValue>>>;
}
