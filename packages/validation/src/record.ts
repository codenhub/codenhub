import { chain, collect, type MaybePromise } from "./async";
import { execute, Validator } from "./core";
import {
  childContext,
  failWith,
  invalidType,
  isPlainObject,
  pass,
  setOwn,
  type Outcome,
  type ParseContext,
} from "./internal";
import { type Message, type ValidationIssue } from "./issue";

/**
 * Output type of a record validator: every key is present for `string` keys, and optional for a
 * union of literal keys, since the validator does not require them.
 *
 * @typeParam TKey - Type of the keys.
 * @typeParam TValue - Type of the values.
 */
export type InferRecord<TKey extends string, TValue> = string extends TKey
  ? Record<TKey, TValue>
  : Partial<Record<TKey, TValue>>;

/**
 * Validator for objects used as dictionaries, created by {@link record}.
 *
 * Every own property is validated, its key and its value. An issue on a key is located at its
 * entry, like an issue on the value.
 *
 * @typeParam TKey - Type of the keys.
 * @typeParam TValue - Type of the values.
 */
export class RecordValidator<TKey extends string, TValue> extends Validator<InferRecord<TKey, TValue>> {
  /**
   * Creates a record validator.
   *
   * @param keyValidator - Validator every key must satisfy.
   * @param valueValidator - Validator every value must satisfy.
   * @param message - Message when the input is not a plain object.
   */
  constructor(
    readonly keyValidator: Validator<TKey>,
    readonly valueValidator: Validator<TValue>,
    private readonly message?: Message,
  ) {
    super();
  }

  protected evaluate(input: unknown, ctx: ParseContext): MaybePromise<Outcome<InferRecord<TKey, TValue>>> {
    if (!isPlainObject(input)) {
      return invalidType(ctx, "object", input, this.message);
    }
    const keys = Object.keys(input);
    const isAborting = ctx.options.abortEarly === true;
    return chain(
      collect(
        keys.length,
        (index) => {
          const key = keys[index] as string;
          const entryCtx = childContext(ctx, key);
          return chain(execute(this.keyValidator, key, entryCtx), (keyOutcome) =>
            chain(
              isAborting && !keyOutcome.ok ? undefined : execute(this.valueValidator, input[key], entryCtx),
              (valueOutcome) => ({ keyOutcome, valueOutcome }),
            ),
          );
        },
        isAborting ? ({ keyOutcome, valueOutcome }) => !keyOutcome.ok || valueOutcome?.ok === false : undefined,
      ),
      (results) => {
        const issues: ValidationIssue[] = [];
        const output: Record<string, unknown> = {};
        for (const { keyOutcome, valueOutcome } of results) {
          if (!keyOutcome.ok) {
            issues.push(...keyOutcome.issues);
          }
          if (valueOutcome !== undefined && !valueOutcome.ok) {
            issues.push(...valueOutcome.issues);
          }
          if (keyOutcome.ok && valueOutcome?.ok) {
            setOwn(output, keyOutcome.value, valueOutcome.value);
          }
        }
        return issues.length > 0 ? failWith(issues) : pass(output as InferRecord<TKey, TValue>);
      },
    );
  }
}

/**
 * Creates a validator for objects used as dictionaries, where every key and every value satisfy a validator.
 *
 * @example
 * ```ts
 * const scores = val.record(val.string(), val.number());
 * const byRole = val.record(val.enum(["admin", "user"]), val.array(val.string()));
 * ```
 *
 * @typeParam TKey - Type of the keys.
 * @typeParam TValue - Type of the values.
 * @param keyValidator - Validator every key must satisfy. Use `val.string()` to accept any key.
 * @param valueValidator - Validator every value must satisfy.
 * @param message - Message when the input is not a plain object.
 * @returns A record validator.
 */
export function record<TKey extends string, TValue>(
  keyValidator: Validator<TKey>,
  valueValidator: Validator<TValue>,
  message?: Message,
): RecordValidator<TKey, TValue> {
  return new RecordValidator(keyValidator, valueValidator, message);
}
