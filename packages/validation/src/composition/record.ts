import { chain, collect, type Maybe } from "../core/async";
import { tail, word } from "../core/checks";
import { append, below, call, composed, placeAll } from "../core/nesting";
import { isPlainObject, objectIssue, setOwn } from "../core/objects";
import { assertFunction, failWith, issue, repeatedKey } from "../core/result";
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
import { assertSizeOptions, sizeIssues, type SizeOptions } from "./size";

/**
 * The object type a record produces. A record with open string keys always has every key it lists;
 * one whose keys are a fixed set of strings may leave some out.
 *
 * @typeParam TKey - The type of the keys.
 * @typeParam TValue - The type of the values.
 */
export type InferRecord<TKey extends string, TValue> = string extends TKey
  ? Record<TKey, TValue>
  : Partial<Record<TKey, TValue>>;

/**
 * Creates a validator for plain objects used as a dictionary: any number of keys, all following
 * the same rules.
 *
 * @remarks
 * Each key passes `key` and each value passes `value`. An issue's path ends at the key it belongs
 * to. A key that fails is reported as one `invalid_key` issue whose `params.issues` holds what the
 * key validator found, so it cannot be mistaken for a problem with the value; the value is still
 * checked. Only own enumerable properties are read, and a getter or `Proxy` trap in the input that
 * throws while it is read propagates, as a callback's exception does. Every value is read when the
 * validator is called, before any key or value validator runs, so a change to the input made by a
 * callback or while an asynchronous key waits never reaches the output. The output is
 * a new object and the input is never modified. A key such as `__proto__` from parsed JSON is
 * kept as data and never writes to a prototype. A key that the `key` validator changes, such as by
 * lowercasing, must stay distinct: a second entry that arrives at a key already taken is reported as
 * `invalid_key` with `{ issues: [{ code: "invalid_value", params: { unique: true } }] }` instead of
 * silently replacing the first. A wrong number of keys is reported at once, as `too_small` or
 * `too_big` with `type: "record"`, without validating any entry. It is synchronous when both validators
 * are, and asynchronous otherwise.
 *
 * @example
 * ```ts
 * const scores = record(string({ min: 1 }), number({ int: true }));
 * scores({ ada: 3, alan: 5 }); // { ok: true, value: { ada: 3, alan: 5 } }
 * scores({ ada: "3" }); // { ok: false, ... }, code "invalid_type" at path ["ada"]
 * ```
 *
 * @typeParam TKey - The validator for keys, producing a string.
 * @typeParam TValue - The validator for values.
 * @param key - Validator applied to every key.
 * @param value - Validator applied to every value.
 * @param rest - Limits on the number of keys, then checks.
 * @returns A validator that produces a dictionary object.
 * @throws {TypeError} When `key` or `value` is not a function, or `min`, `max` or `length` is not a number.
 * @throws {RangeError} When `min`, `max` or `length` is not a non-negative integer, or no size satisfies them together.
 */
export function record<TKey extends AnyValidator<string>, TValue extends AnyValidator>(
  key: TKey,
  value: TValue,
  ...rest: Rest<InferRecord<Extract<Infer<TKey>, string>, Infer<TValue>>, SizeOptions & MessageOptions>
): Composed<TKey | TValue, InferRecord<Extract<Infer<TKey>, string>, Infer<TValue>>>;
export function record<TKey extends AnyValidator<string>, TValue extends AnyValidator>(
  key: TKey,
  value: TValue,
  ...rest: AsyncRest<InferRecord<Extract<Infer<TKey>, string>, Infer<TValue>>, SizeOptions & MessageOptions>
): AsyncValidator<InferRecord<Extract<Infer<TKey>, string>, Infer<TValue>>>;
export function record(key: AnyValidator, value: AnyValidator, ...rest: unknown[]): AnyValidator {
  assertFunction("key", key);
  assertFunction("value", value);
  const [options, reject, accept] = tail<SizeOptions & MessageOptions, Record<string, unknown>>(rest);
  assertSizeOptions(options);
  return composed((input, place): Maybe<ValidationResult<unknown>> => {
    if (!isPlainObject(input)) {
      return reject([objectIssue(input)], place);
    }
    const names = Object.keys(input);
    const oversize = sizeIssues(names.length, "record", options);
    if (oversize.length > 0) {
      return reject(oversize, place);
    }
    // Every value is read before any validator runs, as in `object`, so neither a key validator that
    // changes the input nor a change made while one waits can reach the output.
    const values = names.map((name) => input[name]);
    const entries = names.map((name, index) =>
      chain(key(name), (keyResult) =>
        chain(call(value, values[index], below(place, name)), (valueResult) => ({ keyResult, valueResult })),
      ),
    );
    return chain(collect(entries), (settled) => {
      const issues: ValidationIssue[] = [];
      const output: Record<string, unknown> = {};
      settled.forEach(({ keyResult, valueResult }, index) => {
        const name = names[index] as string;
        if (!keyResult.ok) {
          // Wrapped, so a bad key is not mistaken for a bad value at the same path.
          issues.push(
            ...word(
              placeAll([issue("invalid_key", { issues: keyResult.error.issues }, [name])], place),
              options.message,
            ),
          );
        }
        if (!valueResult.ok) {
          append(issues, valueResult.error.issues);
        }
        if (keyResult.ok && valueResult.ok) {
          if (Object.hasOwn(output, keyResult.value as string)) {
            issues.push(...word(placeAll([repeatedKey(name)], place), options.message));
          } else {
            setOwn(output, keyResult.value as string, valueResult.value);
          }
        }
      });
      return issues.length > 0 ? failWith(issues) : accept(output, place);
    });
  });
}
