import { BaseValidator, type Infer, type ValidationContext, type Validator } from "./core";
import { LiteralValidator } from "./literal";
import { isPlainObject } from "./object";
import { describeReceived, type ValidationIssue, type ValidationResult } from "./result";

/**
 * Shape constraint satisfied by any object validator usable as a variant in a discriminated union.
 */
export type VariantValidator = BaseValidator<unknown> & {
  readonly shape: Record<string, Validator<unknown>>;
};

/**
 * Infers the TypeScript union type produced by validating any of the variants in a discriminated union.
 *
 * @typeParam TVariants - Array of candidate object variant validators.
 */
export type InferDiscriminatedUnion<TVariants extends readonly VariantValidator[]> = Infer<TVariants[number]>;

/**
 * Schema validator for discriminated unions of object schemas indexed by a literal discriminator key.
 *
 * Provides fast O(1) variant lookup using the discriminator property value. If the discriminator
 * property is missing or invalid, an issue is reported specifically at that property path.
 *
 * @typeParam TDiscriminator - Property key used as the discriminator.
 * @typeParam TVariants - Array of object variant schemas.
 */
export class DiscriminatedUnionValidator<
  TDiscriminator extends string,
  TVariants extends readonly VariantValidator[],
> extends BaseValidator<InferDiscriminatedUnion<TVariants>, unknown> {
  private readonly variantMap = new Map<unknown, VariantValidator>();

  /**
   * Constructs a DiscriminatedUnionValidator indexing the given variants by their discriminator value.
   *
   * @param discriminatorKey - Name of the property that identifies the variant.
   * @param _variants - Array of candidate object schemas.
   * @throws Error if any variant does not define a literal validator on the discriminator property.
   */
  constructor(
    readonly discriminatorKey: TDiscriminator,
    protected readonly _variants: TVariants,
  ) {
    super();

    for (const variant of _variants) {
      const discValidator = variant.shape[discriminatorKey];
      if (discValidator instanceof LiteralValidator) {
        this.variantMap.set(discValidator.value, variant);
      } else if (
        discValidator !== null &&
        typeof discValidator === "object" &&
        "value" in discValidator &&
        (discValidator as { value: unknown }).value !== undefined
      ) {
        this.variantMap.set((discValidator as { value: unknown }).value, variant);
      } else {
        throw new Error(
          `Discriminated union variant does not define a literal validator for discriminator key "${discriminatorKey}"`,
        );
      }
    }
  }

  /**
   * Returns the array of candidate object variants.
   */
  get variants(): TVariants {
    return this._variants;
  }

  protected override isAsync(): boolean {
    return this._variants.some((v) => (v as unknown as { isAsync?(): boolean }).isAsync?.() ?? false);
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<InferDiscriminatedUnion<TVariants>> {
    if (!isPlainObject(input)) {
      return ctx.fail({
        code: "invalid_type",
        message: `Expected object, got ${describeReceived(input)}`,
        expected: "plain object",
        received: describeReceived(input),
        input: ctx.options.includeInput ? input : undefined,
      });
    }

    const discValue = (input as Record<string, unknown>)[this.discriminatorKey];
    const variant = this.variantMap.get(discValue);

    if (variant === undefined) {
      const allowed = Array.from(this.variantMap.keys())
        .map((k) => (typeof k === "string" ? `"${k}"` : String(k)))
        .join(", ");

      const issue: ValidationIssue = {
        code: "invalid_value",
        message: `Invalid discriminator value for "${this.discriminatorKey}": expected one of [${allowed}], got ${describeReceived(discValue)}`,
        path: [...ctx.path, this.discriminatorKey],
        expected: `one of [${allowed}]`,
        received: describeReceived(discValue),
        input: ctx.options.includeInput ? discValue : undefined,
      };
      ctx.addIssue(issue);
      return ctx.fail(issue);
    }

    return variant.validate(input, {
      ...ctx.options,
      path: ctx.path,
    }) as ValidationResult<InferDiscriminatedUnion<TVariants>>;
  }

  protected override async _validateAsync(
    input: unknown,
    ctx: ValidationContext,
  ): Promise<ValidationResult<InferDiscriminatedUnion<TVariants>>> {
    if (!isPlainObject(input)) {
      return ctx.fail({
        code: "invalid_type",
        message: `Expected object, got ${describeReceived(input)}`,
        expected: "plain object",
        received: describeReceived(input),
        input: ctx.options.includeInput ? input : undefined,
      });
    }

    const discValue = (input as Record<string, unknown>)[this.discriminatorKey];
    const variant = this.variantMap.get(discValue);

    if (variant === undefined) {
      const allowed = Array.from(this.variantMap.keys())
        .map((k) => (typeof k === "string" ? `"${k}"` : String(k)))
        .join(", ");

      const issue: ValidationIssue = {
        code: "invalid_value",
        message: `Invalid discriminator value for "${this.discriminatorKey}": expected one of [${allowed}], got ${describeReceived(discValue)}`,
        path: [...ctx.path, this.discriminatorKey],
        expected: `one of [${allowed}]`,
        received: describeReceived(discValue),
        input: ctx.options.includeInput ? discValue : undefined,
      };
      ctx.addIssue(issue);
      return ctx.fail(issue);
    }

    const res = await variant.validateAsync(input, {
      ...ctx.options,
      path: ctx.path,
    });
    return res as ValidationResult<InferDiscriminatedUnion<TVariants>>;
  }
}

/**
 * Creates a schema validator for discriminated unions of object schemas indexed by a literal discriminator key.
 *
 * @typeParam TDiscriminator - Property name holding the variant discriminator.
 * @typeParam TVariants - Array of object variant schemas with literal discriminator values.
 * @param discriminatorKey - Name of the property that determines which variant schema to evaluate.
 * @param variants - Array of candidate object schemas.
 * @returns A new DiscriminatedUnionValidator instance.
 */
export function discriminatedUnion<
  TDiscriminator extends string,
  TVariants extends readonly [VariantValidator, ...VariantValidator[]],
>(discriminatorKey: TDiscriminator, variants: TVariants): DiscriminatedUnionValidator<TDiscriminator, TVariants> {
  return new DiscriminatedUnionValidator(discriminatorKey, variants);
}
