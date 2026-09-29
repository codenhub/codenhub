import type { Validator } from "../core/types";
import { oneOf } from "./one-of";

/** An object made by a TypeScript `enum`, or written like one. */
export type EnumLike = Record<string, string | number>;

/** Tests whether `key` is the entry TypeScript adds to map a numeric member's value back to its name. */
const isReverseMapping = (enumObject: EnumLike, key: string): boolean => {
  const name = enumObject[key];
  return typeof name === "string" && String(enumObject[name]) === key && typeof enumObject[name] === "number";
};

/**
 * Creates a validator that accepts any value of a TypeScript `enum`. The reverse-mapping entries
 * TypeScript adds to a numeric enum are not values and are ignored.
 *
 * @example
 * ```ts
 * enum Status { Active = "active", Archived = "archived" }
 * nativeEnum(Status)("active"); // { ok: true, value: Status.Active }
 * nativeEnum(Status)("deleted"); // { ok: false, ... }, code "invalid_value"
 * ```
 *
 * @typeParam T - The enum object.
 * @param enumObject - The enum.
 * @returns A validator that produces a value of the enum.
 */
export function nativeEnum<T extends EnumLike>(enumObject: T): Validator<T[keyof T]> {
  const values = Object.keys(enumObject)
    .filter((key) => !isReverseMapping(enumObject, key))
    .map((key) => enumObject[key] as T[keyof T] & (string | number));
  return oneOf(values);
}
