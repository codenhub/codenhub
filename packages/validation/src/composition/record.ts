import { chain, collect, type Maybe } from "../core/async";
import { isPlainObject, setOwn } from "../core/objects";
import { failWith, invalidType, nestIssues, pass, toIssue } from "../core/result";
import type { AnyValidator, Composed, Infer, ValidationIssue, ValidationResult } from "../core/types";

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
 * checked. Only own enumerable properties are read. The output is
 * a new object and the input is never modified. A key such as `__proto__` from parsed JSON is
 * kept as data and never writes to a prototype. It is synchronous when both validators are, and
 * asynchronous otherwise.
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
 * @returns A validator that produces a dictionary object.
 */
export function record<TKey extends AnyValidator<string>, TValue extends AnyValidator>(
  key: TKey,
  value: TValue,
): Composed<TKey | TValue, InferRecord<Extract<Infer<TKey>, string>, Infer<TValue>>> {
  const validate = (input: unknown): Maybe<ValidationResult<unknown>> => {
    if (!isPlainObject(input)) {
      return invalidType("object", input);
    }
    const names = Object.keys(input);
    const entries = names.map((name) =>
      chain(key(name), (keyResult) => chain(value(input[name]), (valueResult) => ({ keyResult, valueResult }))),
    );
    return chain(collect(entries), (settled) => {
      const issues: ValidationIssue[] = [];
      const output: Record<string, unknown> = {};
      settled.forEach(({ keyResult, valueResult }, index) => {
        const name = names[index] as string;
        if (!keyResult.ok) {
          // Wrapped, so a bad key is not mistaken for a bad value at the same path.
          issues.push(toIssue({ code: "invalid_key", path: [name], params: { issues: keyResult.error.issues } }));
        }
        if (!valueResult.ok) {
          issues.push(...nestIssues(valueResult.error.issues, name));
        }
        if (keyResult.ok && valueResult.ok) {
          setOwn(output, keyResult.value as string, valueResult.value);
        }
      });
      return issues.length > 0 ? failWith(issues) : pass(output);
    });
  };
  return validate as unknown as Composed<TKey | TValue, InferRecord<Extract<Infer<TKey>, string>, Infer<TValue>>>;
}
