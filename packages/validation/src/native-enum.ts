import { BaseValidator, type ValidationContext } from "./core";
import { describeReceived, type ValidationResult } from "./result";

/**
 * Record structure representing a TypeScript runtime enum or an `as const` object map.
 */
export type EnumLike = Record<string, string | number>;

/**
 * Extracts the valid enum values from a TypeScript runtime enum or an `as const` object map,
 * filtering out reverse-mapping keys present in numeric enums.
 *
 * @param enumObj - Enum or object map to inspect.
 * @returns Array of valid enum values.
 */
function getValidEnumValues(enumObj: EnumLike): (string | number)[] {
  const values: (string | number)[] = [];
  for (const [, val] of Object.entries(enumObj)) {
    if (typeof val === "number") {
      values.push(val);
    } else if (typeof val === "string") {
      // In TypeScript numeric enums, reverse mappings map numbers to member name strings
      if (typeof enumObj[val] !== "number") {
        values.push(val);
      }
    }
  }
  return values;
}

/**
 * Schema validator matching input against values defined in a TypeScript runtime enum or `as const` object map.
 *
 * @typeParam T - TypeScript enum or object map type.
 */
export class NativeEnumValidator<T extends EnumLike> extends BaseValidator<T[keyof T], unknown> {
  private readonly allowedValues: (string | number)[];
  private readonly valueSet: Set<unknown>;

  /**
   * Constructs a NativeEnumValidator with the target enum object.
   *
   * @param enumObj - Target enum object or `as const` object map.
   * @param customMessage - Optional custom failure message.
   */
  constructor(
    readonly enumObj: T,
    private readonly customMessage?: string,
  ) {
    super();
    this.allowedValues = getValidEnumValues(enumObj);
    this.valueSet = new Set(this.allowedValues);
  }

  /**
   * Returns the underlying enum object.
   */
  get enum(): T {
    return this.enumObj;
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<T[keyof T]> {
    if (this.valueSet.has(input)) {
      return ctx.ok(input as T[keyof T]);
    }

    const expected = this.allowedValues.map((v) => (typeof v === "string" ? `"${v}"` : String(v))).join(", ");
    return ctx.fail({
      code: "invalid_value",
      message: this.customMessage ?? `Expected one of [${expected}], got ${describeReceived(input)}`,
      expected: `one of [${expected}]`,
      received: describeReceived(input),
      input: ctx.options.includeInput ? input : undefined,
    });
  }
}

/**
 * Creates a schema validator matching values from a TypeScript runtime enum or `as const` object map.
 *
 * @typeParam T - Enum or object map type.
 * @param enumObj - TypeScript enum object or `as const` object mapping.
 * @param message - Optional custom failure message.
 * @returns A new NativeEnumValidator instance.
 */
export function nativeEnum<T extends EnumLike>(enumObj: T, message?: string): NativeEnumValidator<T> {
  return new NativeEnumValidator(enumObj, message);
}
