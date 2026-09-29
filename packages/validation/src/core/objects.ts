import { describeType, failIssue } from "./result";
import type { ValidationErr } from "./types";

/**
 * Tests whether a value is a plain object: created by `{}`, `Object.create(null)`, or `JSON.parse`,
 * in this realm or another, such as an iframe or a `vm` context, whose `Object.prototype` is not ours.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype === Object.prototype || prototype === null) {
    return true;
  }
  // Another realm's Object.prototype is the end of its own chain, and the only prototype that has
  // `isPrototypeOf` as its own property, which tells it from a prototype an author made.
  return Object.getPrototypeOf(prototype) === null && Object.hasOwn(prototype as object, "isPrototypeOf");
}

/**
 * Tests a brand: whether a built-in method that only accepts one kind of object accepts this value.
 * Unlike `instanceof`, it holds across realms and cannot be fooled by a prototype swap.
 */
const hasBrand = (method: () => unknown): boolean => {
  try {
    method();
    return true;
  } catch {
    return false;
  }
};

/** Tests whether a value is a `Date`, valid or not, from this realm or another. */
export const isDate = (value: unknown): value is Date => hasBrand(() => Date.prototype.getTime.call(value));

/** Tests whether a value is a `Map`, from this realm or another. */
export const isMap = (value: unknown): value is Map<unknown, unknown> =>
  hasBrand(() => Map.prototype.has.call(value, undefined));

/** Tests whether a value is a `Set`, from this realm or another. */
export const isSet = (value: unknown): value is Set<unknown> =>
  hasBrand(() => Set.prototype.has.call(value, undefined));

/** Defines an own enumerable property, so a key such as `__proto__` becomes data instead of a prototype write. */
export function setOwn(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
}

/**
 * Fails because the input is not a plain object. An object that has a prototype of its own is named
 * as such, since `received: "object"` beside `expected: "object"` would explain nothing.
 */
export function invalidObject(input: unknown): ValidationErr {
  const received = describeType(input);
  return failIssue("invalid_type", {
    expected: "object",
    received: received === "object" && !isPlainObject(input) ? "non-plain object" : received,
  });
}
