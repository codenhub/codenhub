import { type MaybePromise } from "./async";
import { execute, Validator } from "./core";
import { type Outcome, type ParseContext } from "./internal";

/**
 * Validator that builds its schema on first use, so a schema can refer to itself. Created by {@link lazy}.
 *
 * @typeParam TOutput - Type the resolved validator produces.
 */
export class LazyValidator<TOutput> extends Validator<TOutput> {
  private resolved?: Validator<TOutput>;

  /**
   * Creates a lazy validator.
   *
   * @param getter - Returns the validator. Called once, on the first validation.
   */
  constructor(private readonly getter: () => Validator<TOutput>) {
    super();
  }

  /** The resolved validator. */
  get schema(): Validator<TOutput> {
    return (this.resolved ??= this.getter());
  }

  protected evaluate(input: unknown, ctx: ParseContext): MaybePromise<Outcome<TOutput>> {
    return execute(this.schema, input, ctx);
  }
}

/**
 * Creates a validator that resolves its schema on first use, which lets a schema refer to itself.
 *
 * TypeScript cannot infer a type that refers to itself, so annotate the variable.
 *
 * @example
 * ```ts
 * interface Category { name: string; children: Category[] }
 * const category: Validator<Category> = val.lazy(() =>
 *   val.object({ name: val.string(), children: val.array(category) }),
 * );
 * ```
 *
 * @typeParam TOutput - Type the resolved validator produces.
 * @param getter - Returns the validator. Called once, on the first validation.
 * @returns A lazy validator.
 */
export function lazy<TOutput>(getter: () => Validator<TOutput>): LazyValidator<TOutput> {
  return new LazyValidator(getter);
}
