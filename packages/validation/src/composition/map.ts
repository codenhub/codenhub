import { chain, collect, type Maybe } from "../core/async";
import { report, tail } from "../core/checks";
import { cap, countIssues, runItems } from "../core/limit";
import { append, below, call, composed } from "../core/nesting";
import { entriesOf, sizeOfMap } from "../core/objects";
import { assertFunction, failWith, issue, nested, repeatedKey, typeIssue } from "../core/result";
import type {
  AnyValidator,
  AsyncRest,
  AsyncValidator,
  Composed,
  Infer,
  MessageOptions,
  Rest,
  ValidationIssue,
  ValidationPathSegment,
  ValidationResult,
} from "../core/types";
import { SIZE_OPTIONS, assertSizeOptions, sizeIssues, type SizeOptions } from "./size";

/**
 * Creates a validator for `Map`s whose every key passes `key` and every value passes `value`.
 *
 * @remarks
 * A wrong size is reported at once, without validating the entries. An issue's path ends at the
 * entry's key when it is a string, and at its position in iteration order, a number, for any other
 * key, so no two entries share a path, as a number key and the position of an object key could. A
 * key that fails is reported as one `invalid_key` issue whose `params.issues` holds what the key
 * validator found. A key that the key validator changes must stay distinct: an entry that arrives at a
 * key already taken is reported as `invalid_key`, so no value is silently replaced.
 * The output is a new `Map`. It is synchronous when both validators are, and asynchronous otherwise.
 * A map stops once its entries have reported 1,000 issues: the rest are not validated, and one more
 * issue, `too_big` with `{ maximum: 1000, type: "issues" }`, says that it stopped.
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
 * @param rest - Size limits, then checks.
 * @returns A validator that produces a `Map`.
 * @throws {TypeError} When `key` or `value` is not a function, or `min`, `max` or `length` is not a number.
 * @throws {RangeError} When `min`, `max` or `length` is not a non-negative integer, or no size satisfies them together.
 */
export function map<TKey extends AnyValidator, TValue extends AnyValidator>(
  key: TKey,
  value: TValue,
  ...rest: Rest<Map<Infer<TKey>, Infer<TValue>>, SizeOptions & MessageOptions>
): Composed<TKey | TValue, Map<Infer<TKey>, Infer<TValue>>>;
export function map<TKey extends AnyValidator, TValue extends AnyValidator>(
  key: TKey,
  value: TValue,
  ...rest: AsyncRest<Map<Infer<TKey>, Infer<TValue>>, SizeOptions & MessageOptions>
): AsyncValidator<Map<Infer<TKey>, Infer<TValue>>>;
export function map(key: AnyValidator, value: AnyValidator, ...rest: unknown[]): AnyValidator {
  assertFunction("key", key);
  assertFunction("value", value);
  const [options, reject, accept] = tail<SizeOptions & MessageOptions, Map<unknown, unknown>>(rest, SIZE_OPTIONS);
  assertSizeOptions(options);
  return composed((input, place): Maybe<ValidationResult<unknown>> => {
    const size = sizeOfMap(input);
    if (size === undefined) {
      return reject([typeIssue("map", input)], place);
    }
    const oversize = sizeIssues(size, "map", options);
    if (oversize.length > 0) {
      return reject(oversize, place);
    }
    const entries = entriesOf(input);
    // A string key is its own segment; any other is the position, a number, so segments never collide.
    const segments = entries.map(([name], index) => (typeof name === "string" ? name : index));
    const results = runItems(
      entries.length,
      (index) => {
        const [name, item] = entries[index] as [unknown, unknown];
        return chain(key(name), (keyResult) =>
          chain(call(value, item, below(place, segments[index] as ValidationPathSegment)), (valueResult) => ({
            keyResult,
            valueResult,
          })),
        );
      },
      ({ keyResult, valueResult }) => countIssues(keyResult) + countIssues(valueResult),
    );
    return chain(collect(results), (settled) => {
      const issues: ValidationIssue[] = [];
      const output = new Map<unknown, unknown>();
      settled.forEach(({ keyResult, valueResult }, index) => {
        const segment = segments[index] as ValidationPathSegment;
        if (!keyResult.ok) {
          // Wrapped, so a bad key is not mistaken for a bad value at the same path.
          issues.push(
            ...report(
              [issue("invalid_key", { issues: keyResult.error.issues.map(nested) }, [segment])],
              place,
              options.message,
            ),
          );
        }
        if (!valueResult.ok) {
          append(issues, valueResult.error.issues);
        }
        if (keyResult.ok && valueResult.ok) {
          if (output.has(keyResult.value)) {
            issues.push(...report([repeatedKey(segment)], place, options.message));
          } else {
            output.set(keyResult.value, valueResult.value);
          }
        }
      });
      return issues.length > 0
        ? failWith(cap(issues, place, options.message, settled.length < entries.length))
        : accept(output, place);
    });
  });
}
