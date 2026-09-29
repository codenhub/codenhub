import { type MaybePromise } from "./async";
import { execute, Validator, type Infer } from "./core";
import { fail, invalidType, isPlainObject, type Outcome, type ParseContext } from "./internal";
import { type Message } from "./issue";
import { EnumValidator, formatValue, LiteralValidator, type LiteralValue } from "./literal";
import { type ObjectValidator, type Shape } from "./object";

/** An object validator usable as a variant: its shape has the discriminator key. */
type Variant<TKey extends string> = ObjectValidator<
  Shape & Record<TKey, LiteralValidator<LiteralValue> | EnumValidator<string | number>>
>;

/**
 * Validator for objects that come in several shapes, told apart by the value of one property,
 * created by {@link discriminatedUnion}.
 *
 * It reads the discriminator, picks the one variant it names, and validates against that variant
 * only, so its issues describe the variant the input meant instead of every variant it did not.
 *
 * @typeParam TKey - Name of the discriminator property.
 * @typeParam TVariants - Object validators, one per shape.
 */
export class DiscriminatedUnionValidator<
  TKey extends string,
  TVariants extends readonly [Variant<TKey>, ...Variant<TKey>[]],
> extends Validator<Infer<TVariants[number]>> {
  private readonly byTag = new Map<unknown, Variant<TKey>>();

  /**
   * Creates a discriminated union.
   *
   * @param key - Name of the discriminator property.
   * @param variants - Object validators whose `key` property is a `val.literal()` or `val.enum()`.
   * @param message - Message when the discriminator matches no variant.
   * @throws {TypeError} When a variant does not declare `key` as a literal or enum, or two variants share a value.
   */
  constructor(
    readonly key: TKey,
    readonly variants: TVariants,
    private readonly message?: Message,
  ) {
    super();
    for (const variant of variants) {
      const discriminator = (variant.shape as Shape)[key];
      const tags =
        discriminator instanceof LiteralValidator
          ? [discriminator.value]
          : discriminator instanceof EnumValidator
            ? discriminator.values
            : undefined;
      if (tags === undefined) {
        throw new TypeError(`Every variant must declare "${key}" with val.literal() or val.enum()`);
      }
      for (const tag of tags) {
        if (this.byTag.has(tag)) {
          throw new TypeError(`Two variants accept the same "${key}" value: ${String(tag)}`);
        }
        this.byTag.set(tag, variant);
      }
    }
  }

  /** The discriminator values the union accepts. */
  get tags(): readonly unknown[] {
    return [...this.byTag.keys()];
  }

  protected evaluate(input: unknown, ctx: ParseContext): MaybePromise<Outcome<Infer<TVariants[number]>>> {
    if (!isPlainObject(input)) {
      return invalidType(ctx, "object", input, this.message);
    }
    const variant = Object.hasOwn(input, this.key) ? this.byTag.get(input[this.key]) : undefined;
    if (variant === undefined) {
      return fail(ctx, {
        code: "invalid_union",
        message:
          this.message ??
          `Invalid "${this.key}": expected one of ${this.tags.map((tag) => formatValue(tag as LiteralValue)).join(", ")}`,
        path: [this.key],
        params: { discriminator: this.key, options: this.tags },
        input: Object.hasOwn(input, this.key) ? input[this.key] : undefined,
      });
    }
    return execute(variant, input, ctx) as MaybePromise<Outcome<Infer<TVariants[number]>>>;
  }
}

/**
 * Creates a validator for objects that come in several shapes, told apart by one property.
 *
 * @example
 * ```ts
 * const event = val.discriminatedUnion("type", [
 *   val.object({ type: val.literal("click"), x: val.number(), y: val.number() }),
 *   val.object({ type: val.literal("key"), key: val.string() }),
 * ]);
 * ```
 *
 * @typeParam TKey - Name of the discriminator property.
 * @typeParam TVariants - Object validators, one per shape.
 * @param key - Name of the discriminator property.
 * @param variants - Object validators whose `key` property is a `val.literal()` or `val.enum()`, with no value shared between variants.
 * @param message - Message when the discriminator matches no variant.
 * @returns A discriminated union validator.
 * @throws {TypeError} When a variant does not declare `key` as a literal or enum, or two variants share a value.
 */
export function discriminatedUnion<
  const TKey extends string,
  const TVariants extends readonly [Variant<TKey>, ...Variant<TKey>[]],
>(key: TKey, variants: TVariants, message?: Message): DiscriminatedUnionValidator<TKey, TVariants> {
  return new DiscriminatedUnionValidator(key, variants, message);
}
