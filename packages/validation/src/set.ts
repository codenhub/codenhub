import { chain, collect, type MaybePromise } from "./async";
import { execute, Validator } from "./core";
import { childContext, failWith, invalidType, pass, sizeLimit, type Outcome, type ParseContext } from "./internal";
import { type Message, type ValidationIssue } from "./issue";

/**
 * Validator for `Set` instances whose values all satisfy one validator, created by {@link set}.
 *
 * Issues are located by the position of the value in iteration order.
 *
 * @typeParam TItem - Type of the values.
 */
export class SetValidator<TItem> extends Validator<Set<TItem>> {
  /**
   * Creates a set validator.
   *
   * @param element - Validator every value must satisfy.
   * @param message - Message when the input is not a `Set`.
   */
  constructor(
    readonly element: Validator<TItem>,
    private readonly message?: Message,
  ) {
    super();
  }

  protected evaluate(input: unknown, ctx: ParseContext): MaybePromise<Outcome<Set<TItem>>> {
    if (!(input instanceof Set)) {
      return invalidType(ctx, "set", input, this.message);
    }
    const values = [...(input as Set<unknown>)];
    return chain(
      collect(
        values.length,
        (index) => execute(this.element, values[index], childContext(ctx, index)),
        ctx.options.abortEarly === true ? (outcome) => !outcome.ok : undefined,
      ),
      (outcomes) => {
        const issues: ValidationIssue[] = [];
        const output = new Set<TItem>();
        for (const outcome of outcomes) {
          if (outcome.ok) {
            output.add(outcome.value);
          } else {
            issues.push(...outcome.issues);
          }
        }
        return issues.length > 0 ? failWith(issues) : pass(output);
      },
    );
  }

  /**
   * Requires at least `size` values.
   *
   * @param size - Minimum number of values, a non-negative integer.
   * @param message - Failure message.
   * @returns The validator with the rule added.
   * @throws {RangeError} When `size` is not a non-negative integer.
   */
  min(size: number, message?: Message): this {
    return this.addStep(sizeLimit("min", size, { type: "set", measure: (values: Set<TItem>) => values.size, message }));
  }

  /**
   * Allows at most `size` values.
   *
   * @param size - Maximum number of values, a non-negative integer.
   * @param message - Failure message.
   * @returns The validator with the rule added.
   * @throws {RangeError} When `size` is not a non-negative integer.
   */
  max(size: number, message?: Message): this {
    return this.addStep(sizeLimit("max", size, { type: "set", measure: (values: Set<TItem>) => values.size, message }));
  }

  /**
   * Requires at least one value.
   *
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  nonEmpty(message?: Message): this {
    return this.min(1, message ?? "Must not be empty");
  }
}

/**
 * Creates a validator for `Set` instances whose values all satisfy a validator.
 *
 * @typeParam TItem - Type of the values.
 * @param element - Validator every value must satisfy.
 * @param message - Message when the input is not a `Set`.
 * @returns A set validator.
 */
export function set<TItem>(element: Validator<TItem>, message?: Message): SetValidator<TItem> {
  return new SetValidator(element, message);
}
