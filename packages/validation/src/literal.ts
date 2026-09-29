import { Validator } from "./core";
import { fail, pass, type Outcome, type ParseContext } from "./internal";
import { type Message } from "./issue";

/** Values a {@link literal} validator can match exactly. */
export type LiteralValue = string | number | boolean | bigint | symbol | null | undefined;

/** Enum-like object: a TypeScript `enum`, or an `as const` object of strings and numbers. */
export type EnumLike = Record<string, string | number>;

export const formatValue = (value: LiteralValue): string =>
  typeof value === "string" ? JSON.stringify(value) : typeof value === "bigint" ? `${value}n` : String(value);

/**
 * Validator that accepts exactly one value, created by {@link literal}.
 *
 * @typeParam T - The accepted value.
 */
export class LiteralValidator<T extends LiteralValue> extends Validator<T> {
  /** The only accepted value. */
  readonly value: T;

  /**
   * Creates a literal validator.
   *
   * @param value - Value to accept.
   * @param message - Message of the failure.
   */
  constructor(
    value: T,
    private readonly message?: Message,
  ) {
    super();
    this.value = value;
  }

  protected evaluate(input: unknown, ctx: ParseContext): Outcome<T> {
    if (input === this.value) {
      return pass(this.value);
    }
    return fail(ctx, {
      code: "invalid_value",
      message: this.message ?? `Expected ${formatValue(this.value)}`,
      params: { expected: this.value },
      input,
    });
  }
}

/**
 * Validator that accepts one of a fixed set of strings or numbers, created by {@link enumOf} and {@link nativeEnum}.
 *
 * @typeParam T - The accepted values.
 */
export class EnumValidator<T extends string | number> extends Validator<T> {
  /** The accepted values. */
  readonly values: readonly T[];

  /**
   * Creates an enum validator.
   *
   * @param values - Values to accept.
   * @param message - Message of the failure.
   */
  constructor(
    values: readonly T[],
    private readonly message?: Message,
  ) {
    super();
    this.values = values;
  }

  protected evaluate(input: unknown, ctx: ParseContext): Outcome<T> {
    if ((this.values as readonly unknown[]).includes(input)) {
      return pass(input as T);
    }
    return fail(ctx, {
      code: "invalid_value",
      message: this.message ?? `Expected one of ${this.values.map(formatValue).join(", ")}`,
      params: { options: this.values },
      input,
    });
  }
}

/**
 * Creates a validator that accepts exactly one value.
 *
 * @example
 * ```ts
 * const kind = val.literal("click");
 * ```
 *
 * @typeParam T - The accepted value.
 * @param value - Value to accept, compared with `===`.
 * @param message - Message of the failure.
 * @returns A literal validator.
 */
export function literal<const T extends LiteralValue>(value: T, message?: Message): LiteralValidator<T> {
  return new LiteralValidator(value, message);
}

/**
 * Creates a validator that accepts one of a fixed list of strings or numbers.
 *
 * @example
 * ```ts
 * const role = val.enum(["admin", "user"]);
 * ```
 *
 * @typeParam T - The accepted values.
 * @param values - Values to accept.
 * @param message - Message of the failure.
 * @returns An enum validator.
 */
export function enumOf<const T extends readonly (string | number)[]>(
  values: T,
  message?: Message,
): EnumValidator<T[number]> {
  return new EnumValidator<T[number]>(values, message);
}

/**
 * Creates a validator that accepts the values of a TypeScript `enum` or an `as const` object.
 *
 * Reverse-mapped keys of numeric enums are not accepted.
 *
 * @example
 * ```ts
 * enum Color { Red = "red", Blue = "blue" }
 * const color = val.nativeEnum(Color);
 * ```
 *
 * @typeParam T - The enum object.
 * @param enumObject - Enum whose values are accepted.
 * @param message - Message of the failure.
 * @returns An enum validator.
 */
export function nativeEnum<T extends EnumLike>(enumObject: T, message?: Message): EnumValidator<T[keyof T]> {
  const values = Object.keys(enumObject)
    .filter((key) => typeof enumObject[enumObject[key] as string] !== "number")
    .map((key) => enumObject[key] as T[keyof T]);
  return new EnumValidator(values, message);
}
