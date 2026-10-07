import { member } from "../core/checks";
import type { AnyValidator, AsyncRest, AsyncValidator, MessageOptions, Rest, Validator } from "../core/types";
import type { LiteralValue } from "./literal";

/** An object made by a TypeScript `enum`, or written like one. */
export type EnumLike = Readonly<Record<string, string | number>>;

/** The values a list or an enum holds. */
type ValuesOf<T> = T extends readonly unknown[] ? T[number] : T[keyof T];

/** Tests whether `key` is the entry TypeScript adds to map a numeric member's value back to its name. */
const isReverseMapping = (enumObject: EnumLike, key: string): boolean => {
  const name = enumObject[key];
  return typeof name === "string" && String(enumObject[name]) === key && typeof enumObject[name] === "number";
};

/**
 * Creates a validator that accepts any one value of a list or of a TypeScript `enum`, compared with
 * `===`. The type is the union of the values, so `oneOf(["admin", "user"])` produces
 * `"admin" | "user"`, and the value produced is the one listed, so `oneOf([0])` produces `0` for `-0`,
 * which `===` matches. The entries TypeScript adds to a numeric enum to map values back to names are
 * not values and are ignored, in an object written like an enum too, so `{ a: 1, "1": "a" }` holds `1`
 * alone.
 *
 * @example
 * ```ts
 * const role = oneOf(["admin", "user"]);
 * role("admin"); // { ok: true, value: "admin" }
 * role("guest"); // { ok: false, ... }, code "invalid_value", params { options: ["admin", "user"] }
 *
 * enum Status { Active = "active", Archived = "archived" }
 * oneOf(Status)("active"); // { ok: true, value: Status.Active }
 * ```
 *
 * @typeParam T - The list or the enum.
 * @param values - The accepted values: a list of primitives, as for `literal`, or an enum. It is copied,
 * so changing it later has no effect.
 * @param rest - Options, then checks.
 * @returns A validator that produces one of the values.
 * @throws {TypeError} When `values` is neither a list nor an enum, such as text, which would be read as
 * its characters, or a `Set`, the list has a hole, there is no value, so the validator would accept nothing, or a value is an object or a
 * function, which equals only itself.
 * @throws {RangeError} When a value is `NaN`, which no value equals.
 */
export function oneOf<const T extends readonly LiteralValue[] | EnumLike>(
  values: T,
  ...rest: Rest<ValuesOf<T>, MessageOptions>
): Validator<ValuesOf<T>, ValuesOf<T>>;
export function oneOf<const T extends readonly LiteralValue[] | EnumLike>(
  values: T,
  ...rest: AsyncRest<ValuesOf<T>, MessageOptions>
): AsyncValidator<ValuesOf<T>, ValuesOf<T>>;
export function oneOf(values: readonly LiteralValue[] | EnumLike, ...rest: unknown[]): AnyValidator {
  // Text would be read as a list of its characters. `Object(value) === value` holds for objects alone.
  // A `Set` or any other object of a class would be read as an enum with no members.
  const prototype: unknown = Object(values) === values ? Object.getPrototypeOf(values) : undefined;
  if (!Array.isArray(values) && prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("oneOf() needs a list or an enum of primitives");
  }
  // A hole in a list, `[, "a"]`, would be copied as `undefined` and accepted, which no one wrote.
  if (Array.isArray(values) && values.filter(() => true).length < values.length) {
    throw new TypeError("oneOf() needs a list without holes");
  }
  const options: readonly unknown[] = Array.isArray(values)
    ? [...values]
    : Object.keys(values)
        .filter((key) => !isReverseMapping(values as EnumLike, key))
        .map((key) => (values as EnumLike)[key]);
  if (options.length === 0) {
    throw new TypeError("oneOf() needs at least one value");
  }
  // An object or a function equals only itself, so it would match no value parsed from input.
  if (options.some((option) => Object(option) === option)) {
    throw new TypeError("oneOf() needs a list or an enum of primitives");
  }
  if (options.some((option) => Number.isNaN(option))) {
    throw new RangeError("oneOf() cannot match NaN, which no value equals");
  }
  // A bigint is reported as its decimal digits, since `JSON.stringify` throws on one, and a list of bigints
  // alone says so with `type: "bigint"`.
  const reported = options.map((option) => (typeof option === "bigint" ? String(option) : option));
  const isBigints = options.every((option) => typeof option === "bigint");
  // A copy per failure, so changing an issue's list cannot change what the validator accepts. indexOf
  // compares with ===, as documented, where includes would also match NaN.
  return member(
    (input) => {
      const index = options.indexOf(input);
      return index === -1 ? undefined : [options[index]];
    },
    () => (isBigints ? { options: [...reported], type: "bigint" } : { options: [...reported] }),
    rest,
    { kind: "oneOf", values: Object.freeze(options) },
  );
}
