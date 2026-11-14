import { runOf, toolsOf } from "../core/child";
import { accepter, waitsOf } from "../core/finish";
import { refuseReserved, RESERVED_KEY } from "../core/keys";
import { toValidator } from "../core/make";
import { isPlainObject, refuseObject, setOwn } from "../core/objects";
import { describeType } from "../core/result";
import { FAIL, type Run } from "../core/run";
import { split } from "../core/split";
import type {
  AnyValidator,
  AsyncRest,
  AsyncSchema,
  Composed,
  Infer,
  InferInput,
  MessageOptions,
  Rest,
} from "../core/types";
import { wordKey, wordSize, wordType } from "../core/words";
import { settleEntries } from "./entries";
import { SIZE_OPTIONS, assertSizeOptions, reportSize, type SizeOptions } from "./size";

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
 * The type of input that can pass a record: the keys its key validator accepts, when it names them, and
 * any key otherwise.
 *
 * @typeParam TKey - The validator for keys.
 * @typeParam TValue - The validator for values.
 */
export type InferRecordInput<TKey extends AnyValidator, TValue extends AnyValidator> = InferRecord<
  [InferInput<TKey>] extends [string] ? InferInput<TKey> : string,
  InferInput<TValue>
>;

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
 * a new object and the input is never modified. A `__proto__` key, as parsed JSON can hold, is
 * reported as `invalid_key` with `{ issues: [{ code: "invalid_value", params: { reserved: true } }] }`,
 * whether the input has it or the `key` validator produces it: kept as data it would become the
 * prototype of any copy made by assignment, such as `Object.assign({}, output)`. A key that the `key` validator changes, such as by
 * lowercasing, must stay distinct: a second entry that arrives at a key already taken is reported as
 * `invalid_key` with `{ issues: [{ code: "invalid_value", params: { unique: true } }] }` instead of
 * silently replacing the first. A wrong number of keys is reported at once, as `too_small` or
 * `too_big` with `type: "record"`, without validating any entry. It is synchronous when both validators
 * are, and asynchronous otherwise.
 * A record stops once its entries have reported 1,000 issues: the rest are not validated, and one more
 * issue, `too_big` with `{ maximum: 1000, type: "issues" }`, says that it stopped.
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
 * @throws {TypeError} When `key` or `value` is not a validator of this copy of the package, or `min`, `max` or `length` is not a number,
 * and, from the returned validator, when `key` produces something other than text.
 * @throws {RangeError} When `min`, `max` or `length` is not a non-negative integer, or no size satisfies them together.
 */
export function record<TKey extends AnyValidator<string>, TValue extends AnyValidator>(
  key: TKey,
  value: TValue,
  ...rest: Rest<InferRecord<Extract<Infer<TKey>, string>, Infer<TValue>>, SizeOptions & MessageOptions>
): Composed<TKey | TValue, InferRecord<Extract<Infer<TKey>, string>, Infer<TValue>>, InferRecordInput<TKey, TValue>>;
export function record<TKey extends AnyValidator<string>, TValue extends AnyValidator>(
  key: TKey,
  value: TValue,
  ...rest: AsyncRest<InferRecord<Extract<Infer<TKey>, string>, Infer<TValue>>, SizeOptions & MessageOptions>
): AsyncSchema<InferRecord<Extract<Infer<TKey>, string>, Infer<TValue>>, InferRecordInput<TKey, TValue>>;
export function record(key: AnyValidator, value: AnyValidator, ...rest: unknown[]): AnyValidator {
  // A key's issues stay relative to the key, so they are held behind an issue of the record.
  const runKey = runOf(key, "key");
  const runValue = runOf(value, "value");
  const [options, checks] = split<SizeOptions & MessageOptions, Record<string, unknown>>(rest, SIZE_OPTIONS);
  assertSizeOptions(options);
  const { message } = options;
  const accept = accepter(checks, message);
  const tools = toolsOf([runKey, runValue], waitsOf(checks));
  const run: Run = (input) => {
    if (!isPlainObject(input)) {
      return refuseObject(input, message);
    }
    const names = Object.keys(input);
    if (reportSize(names.length, "record", options, message)) {
      return FAIL;
    }
    const output: Record<string, unknown> = {};
    return settleEntries(
      names,
      // Every value is read before any validator runs, so neither a key validator that changes the
      // input nor a change made while one waits can reach the output.
      names.map((name) => input[name]),
      names,
      runKey,
      runValue,
      tools,
      message,
      accept,
      (name, item) => {
        if (Object.hasOwn(output, name as string)) {
          return false;
        }
        setOwn(output, name as string, item);
        return true;
      },
      output,
      (name, worded, segment) => {
        if (typeof name !== "string") {
          // The types forbid it, but a number would become text and a symbol a key no `Object.keys` lists.
          throw new TypeError(`A record's key validator must produce text, received ${describeType(name)}`);
        }
        if (name === RESERVED_KEY) {
          refuseReserved(worded, segment);
        }
      },
    );
  };
  run.w = tools;
  return toValidator(run, { kind: "record", options, checks, key, value }, [wordType, wordSize, wordKey], [key, value]);
}
