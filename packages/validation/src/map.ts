import { chain, collect, type MaybePromise } from "./async";
import { execute, Validator } from "./core";
import { childContext, failWith, invalidType, pass, sizeLimit, type Outcome, type ParseContext } from "./internal";
import { type Message, type ValidationIssue } from "./issue";

/**
 * Validator for `Map` instances, created by {@link map}.
 *
 * An issue is located by the entry's key when it is a string or number, and by its position in
 * iteration order otherwise. An issue on a key is located at its entry, like an issue on the value.
 *
 * @typeParam TKey - Type of the keys.
 * @typeParam TValue - Type of the values.
 */
export class MapValidator<TKey, TValue> extends Validator<Map<TKey, TValue>> {
  /**
   * Creates a map validator.
   *
   * @param keyValidator - Validator every key must satisfy.
   * @param valueValidator - Validator every value must satisfy.
   * @param message - Message when the input is not a `Map`.
   */
  constructor(
    readonly keyValidator: Validator<TKey>,
    readonly valueValidator: Validator<TValue>,
    private readonly message?: Message,
  ) {
    super();
  }

  protected evaluate(input: unknown, ctx: ParseContext): MaybePromise<Outcome<Map<TKey, TValue>>> {
    if (!(input instanceof Map)) {
      return invalidType(ctx, "map", input, this.message);
    }
    const entries = [...(input as Map<unknown, unknown>)];
    const isAborting = ctx.options.abortEarly === true;
    return chain(
      collect(
        entries.length,
        (index) => {
          const [key, value] = entries[index] as [unknown, unknown];
          const entryCtx = childContext(ctx, typeof key === "string" || typeof key === "number" ? key : index);
          return chain(execute(this.keyValidator, key, entryCtx), (keyOutcome) =>
            chain(
              isAborting && !keyOutcome.ok ? undefined : execute(this.valueValidator, value, entryCtx),
              (valueOutcome) => ({ keyOutcome, valueOutcome }),
            ),
          );
        },
        isAborting ? ({ keyOutcome, valueOutcome }) => !keyOutcome.ok || valueOutcome?.ok === false : undefined,
      ),
      (results) => {
        const issues: ValidationIssue[] = [];
        const output = new Map<TKey, TValue>();
        for (const { keyOutcome, valueOutcome } of results) {
          if (!keyOutcome.ok) {
            issues.push(...keyOutcome.issues);
          }
          if (valueOutcome !== undefined && !valueOutcome.ok) {
            issues.push(...valueOutcome.issues);
          }
          if (keyOutcome.ok && valueOutcome?.ok) {
            output.set(keyOutcome.value, valueOutcome.value);
          }
        }
        return issues.length > 0 ? failWith(issues) : pass(output);
      },
    );
  }

  /**
   * Requires at least `size` entries.
   *
   * @param size - Minimum number of entries, a non-negative integer.
   * @param message - Failure message.
   * @returns The validator with the rule added.
   * @throws {RangeError} When `size` is not a non-negative integer.
   */
  min(size: number, message?: Message): this {
    return this.addStep(
      sizeLimit("min", size, { type: "map", measure: (entries: Map<TKey, TValue>) => entries.size, message }),
    );
  }

  /**
   * Allows at most `size` entries.
   *
   * @param size - Maximum number of entries, a non-negative integer.
   * @param message - Failure message.
   * @returns The validator with the rule added.
   * @throws {RangeError} When `size` is not a non-negative integer.
   */
  max(size: number, message?: Message): this {
    return this.addStep(
      sizeLimit("max", size, { type: "map", measure: (entries: Map<TKey, TValue>) => entries.size, message }),
    );
  }

  /**
   * Requires at least one entry.
   *
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  nonEmpty(message?: Message): this {
    return this.min(1, message ?? "Must not be empty");
  }
}

/**
 * Creates a validator for `Map` instances.
 *
 * @typeParam TKey - Type of the keys.
 * @typeParam TValue - Type of the values.
 * @param keyValidator - Validator every key must satisfy.
 * @param valueValidator - Validator every value must satisfy.
 * @param message - Message when the input is not a `Map`.
 * @returns A map validator.
 */
export function map<TKey, TValue>(
  keyValidator: Validator<TKey>,
  valueValidator: Validator<TValue>,
  message?: Message,
): MapValidator<TKey, TValue> {
  return new MapValidator(keyValidator, valueValidator, message);
}
