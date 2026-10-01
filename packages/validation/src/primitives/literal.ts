import { member } from "../core/checks";
import type { AnyValidator, AsyncRest, AsyncValidator, MessageOptions, Rest, Validator } from "../core/types";

/** A value a validator can require exactly: any primitive, including `null` and `undefined`. */
export type LiteralValue = string | number | boolean | bigint | symbol | null | undefined;

/**
 * Creates a validator that accepts exactly one value, compared with `===`. The type is the value
 * itself, so `literal("admin")` produces `"admin"` and not `string`. It is also how `null` and
 * `undefined` are validated: `literal(null)`.
 *
 * @example
 * ```ts
 * const role = literal("admin");
 * role("admin"); // { ok: true, value: "admin" }
 * role("user"); // { ok: false, ... }, code "invalid_value", params { expected: "admin" }
 * literal(true, { message: "You must accept the terms" });
 * ```
 *
 * @typeParam T - The literal type.
 * @param value - The only accepted value.
 * @param rest - Options, then checks.
 * @returns A validator that produces `value`.
 * @throws {TypeError} When `value` is an object or a function, which equals only itself.
 * @throws {RangeError} When `value` is `NaN`, which no value equals, so the literal would accept nothing.
 */
export function literal<const T extends LiteralValue>(value: T, ...rest: Rest<T, MessageOptions>): Validator<T>;
export function literal<const T extends LiteralValue>(
  value: T,
  ...rest: AsyncRest<T, MessageOptions>
): AsyncValidator<T>;
export function literal(value: LiteralValue, ...rest: unknown[]): AnyValidator {
  // An object or a function equals only itself, so the literal would reject every value parsed from input.
  if (Object(value) === value) {
    throw new TypeError("literal() needs a primitive");
  }
  if (Number.isNaN(value)) {
    throw new RangeError("literal(NaN) accepts nothing");
  }
  return member(
    (input) => input === value,
    () => ({ expected: value }),
    rest,
  );
}
