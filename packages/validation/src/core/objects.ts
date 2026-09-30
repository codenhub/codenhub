import { describeType, failIssue } from "./result";
import type { ValidationErr } from "./types";

/**
 * Tests whether a value is a plain object: created by `{}`, `Object.create(null)`, or `JSON.parse`,
 * in this realm or another, such as an iframe or a `vm` context, whose `Object.prototype` is not ours.
 * A value whose prototype cannot be inspected, such as a proxy that throws, is not one.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  try {
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype === Object.prototype || prototype === null) {
      return true;
    }
    // Another realm's Object.prototype ends its own chain and owns `isPrototypeOf`. That is a test of
    // shape: a prototype made to look exactly so passes too, which costs nothing, since only own
    // properties are read and the output is a new object.
    return Object.getPrototypeOf(prototype) === null && Object.hasOwn(prototype as object, "isPrototypeOf");
  } catch {
    return false;
  }
}

/**
 * Runs a built-in method on a value and returns what it gives, or undefined when the value is not
 * the kind the method belongs to. The methods are called through their own prototype, not through the
 * value, so a Date, Map or Set from another realm, or one whose prototype was swapped, is read the same
 * way, and the validators never call a method the value may not have.
 */
const brand = <T>(read: () => T): T | undefined => {
  try {
    return read();
  } catch {
    return undefined;
  }
};

/**
 * Reads `size` with the getter of a Map or Set prototype. It is looked up when called and not once at
 * load, because a call made while the module loads is never dropped from a bundle, and every consumer
 * would carry it.
 */
const sizeOf = (prototype: object, value: unknown): number | undefined => {
  const getter = Object.getOwnPropertyDescriptor(prototype, "size")?.get as (() => number) | undefined;
  return brand(() => getter?.call(value));
};

/** The moment a `Date` holds, `NaN` for an invalid one, or undefined when the value is not a `Date`, in any realm. */
export const timeOf = (value: unknown): number | undefined => brand(() => Date.prototype.getTime.call(value));

/**
 * The source of a regular expression, or undefined when the value is not one, in any realm. The getter
 * is looked up when called, as `size` is, and reads the value's own slot, so an object that only has a
 * `source` property is not taken for a regular expression.
 */
export const sourceOfRegExp = (value: unknown): string | undefined => {
  const getter = Object.getOwnPropertyDescriptor(RegExp.prototype, "source")?.get as (() => string) | undefined;
  return brand(() => getter?.call(value));
};

/** How many entries a `Map` holds, or undefined when the value is not a `Map`, in any realm. */
export const sizeOfMap = (value: unknown): number | undefined => sizeOf(Map.prototype, value);

/** How many values a `Set` holds, or undefined when the value is not a `Set`, in any realm. */
export const sizeOfSet = (value: unknown): number | undefined => sizeOf(Set.prototype, value);

/** The entries of a value already known to be a `Map`, read with the built-in iterator. */
export const entriesOf = (map: unknown): [unknown, unknown][] => [
  ...Map.prototype.entries.call(map as Map<unknown, unknown>),
];

/** The values of a value already known to be a `Set`, read with the built-in iterator. */
export const valuesOf = (set: unknown): unknown[] => [...Set.prototype.values.call(set as Set<unknown>)];

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
