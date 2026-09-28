import { chain, collect, type MaybePromise } from "./async";
import { execute, Validator } from "./core";
import { childContext, failWith, invalidType, pass, sizeLimit, type Outcome, type ParseContext } from "./internal";
import { type Message, type ValidationIssue } from "./issue";

/**
 * Validator for arrays whose items all satisfy one validator, created by {@link array}.
 *
 * @typeParam TItem - Type of the items.
 */
export class ArrayValidator<TItem> extends Validator<TItem[]> {
  /**
   * Creates an array validator.
   *
   * @param element - Validator every item must satisfy.
   * @param message - Message when the input is not an array.
   */
  constructor(
    readonly element: Validator<TItem>,
    private readonly message?: Message,
  ) {
    super();
  }

  protected evaluate(input: unknown, ctx: ParseContext): MaybePromise<Outcome<TItem[]>> {
    if (!Array.isArray(input)) {
      return invalidType(ctx, "array", input, this.message);
    }
    return chain(
      collect(
        input.length,
        (index) => execute(this.element, input[index], childContext(ctx, index)),
        ctx.options.abortEarly === true ? (outcome) => !outcome.ok : undefined,
      ),
      (outcomes) => {
        const issues: ValidationIssue[] = [];
        const items: TItem[] = [];
        for (const outcome of outcomes) {
          if (outcome.ok) {
            items.push(outcome.value);
          } else {
            issues.push(...outcome.issues);
          }
        }
        return issues.length > 0 ? failWith(issues) : pass(items);
      },
    );
  }

  /**
   * Requires at least `size` items.
   *
   * @param size - Minimum number of items, a non-negative integer.
   * @param message - Failure message.
   * @returns The validator with the rule added.
   * @throws {RangeError} When `size` is not a non-negative integer.
   */
  min(size: number, message?: Message): this {
    return this.addStep(sizeLimit("min", size, { type: "array", measure: (items: TItem[]) => items.length, message }));
  }

  /**
   * Allows at most `size` items.
   *
   * @param size - Maximum number of items, a non-negative integer.
   * @param message - Failure message.
   * @returns The validator with the rule added.
   * @throws {RangeError} When `size` is not a non-negative integer.
   */
  max(size: number, message?: Message): this {
    return this.addStep(sizeLimit("max", size, { type: "array", measure: (items: TItem[]) => items.length, message }));
  }

  /**
   * Requires exactly `size` items.
   *
   * @param size - Required number of items, a non-negative integer.
   * @param message - Failure message.
   * @returns The validator with the rule added.
   * @throws {RangeError} When `size` is not a non-negative integer.
   */
  length(size: number, message?: Message): this {
    return this.addStep(
      sizeLimit("exact", size, { type: "array", measure: (items: TItem[]) => items.length, message }),
    );
  }

  /**
   * Requires at least one item.
   *
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  nonEmpty(message?: Message): this {
    return this.min(1, message ?? "Must not be empty");
  }

  /**
   * Requires items to be distinct, reporting an issue at the index of each repeat.
   *
   * Items are compared with `Map` semantics (`SameValueZero`), so objects match only by identity
   * unless `by` maps them to something comparable.
   *
   * @param by - Maps an item to the value that must be distinct, such as `(user) => user.id`.
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  unique(by?: (item: TItem) => unknown, message?: Message): this {
    return this.addStep((items, ctx) => {
      const seen = new Set<unknown>();
      items.forEach((item, index) => {
        const key = by === undefined ? item : by(item);
        if (seen.has(key)) {
          ctx.addIssue({
            code: "invalid_value",
            message: message ?? "Must be unique",
            path: [index],
            params: { unique: true },
            input: item,
          });
        }
        seen.add(key);
      });
    });
  }
}

/**
 * Creates a validator for arrays whose items all satisfy a validator.
 *
 * @example
 * ```ts
 * const tags = val.array(val.string()).max(5);
 * ```
 *
 * @typeParam TItem - Type of the items.
 * @param element - Validator every item must satisfy. Use `val.unknown()` to accept any item.
 * @param message - Message when the input is not an array.
 * @returns An array validator.
 */
export function array<TItem>(element: Validator<TItem>, message?: Message): ArrayValidator<TItem> {
  return new ArrayValidator(element, message);
}
