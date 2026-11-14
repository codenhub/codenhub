import { runOf, toolsOf } from "../core/child";
import { accepter, waitsOf } from "../core/finish";
import { toValidator } from "../core/make";
import { entriesOf, sizeOfMap } from "../core/objects";
import { FAIL, refuse, type Run } from "../core/run";
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
 * @throws {TypeError} When `key` or `value` is not a validator of this copy of the package, or `min`, `max` or `length` is not a number.
 * @throws {RangeError} When `min`, `max` or `length` is not a non-negative integer, or no size satisfies them together.
 */
export function map<TKey extends AnyValidator, TValue extends AnyValidator>(
  key: TKey,
  value: TValue,
  ...rest: Rest<Map<Infer<TKey>, Infer<TValue>>, SizeOptions & MessageOptions>
): Composed<TKey | TValue, Map<Infer<TKey>, Infer<TValue>>, Map<InferInput<TKey>, InferInput<TValue>>>;
export function map<TKey extends AnyValidator, TValue extends AnyValidator>(
  key: TKey,
  value: TValue,
  ...rest: AsyncRest<Map<Infer<TKey>, Infer<TValue>>, SizeOptions & MessageOptions>
): AsyncSchema<Map<Infer<TKey>, Infer<TValue>>, Map<InferInput<TKey>, InferInput<TValue>>>;
export function map(key: AnyValidator, value: AnyValidator, ...rest: unknown[]): AnyValidator {
  // A key's issues stay relative to the key, so they are held behind an issue of the map.
  const runKey = runOf(key, "key");
  const runValue = runOf(value, "value");
  const [options, checks] = split<SizeOptions & MessageOptions, Map<unknown, unknown>>(rest, SIZE_OPTIONS);
  assertSizeOptions(options);
  const { message } = options;
  const accept = accepter(checks, message);
  const tools = toolsOf([runKey, runValue], waitsOf(checks));
  const run: Run = (input) => {
    const size = sizeOfMap(input);
    if (size === undefined) {
      return refuse("map", input, message);
    }
    if (reportSize(size, "map", options, message)) {
      return FAIL;
    }
    const entries = entriesOf(input);
    const output = new Map<unknown, unknown>();
    return settleEntries(
      entries.map(([name]) => name),
      entries.map(([, item]) => item),
      // A string key is its own segment; any other is the position, a number, so segments never collide.
      entries.map(([name], index) => (typeof name === "string" ? name : index)),
      runKey,
      runValue,
      tools,
      message,
      accept,
      (name, item) => {
        if (output.has(name)) {
          return false;
        }
        output.set(name, item);
        return true;
      },
      output,
    );
  };
  run.w = tools;
  return toValidator(run, { kind: "map", options, checks, key, value }, [wordType, wordSize, wordKey], [key, value]);
}
