import { describeType, issue } from "./result";
import type { ValidationIssue } from "./types";

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
 * Rejects a shape that is not a plain object, such as a list of validators, whose properties would be
 * named `0`, `1` and on, or one with a key that is never read, a symbol or a key that is not enumerable,
 * whose validator would never run, since each is a mistake in the schema and not in the input.
 */
export function assertShape(shape: unknown, name = "shape"): void {
  if (!isPlainObject(shape)) {
    throw new TypeError(`${name} must be a plain object of validators, received ${describeType(shape)}`);
  }
  const hidden = Reflect.ownKeys(shape).find(
    (key) => typeof key === "symbol" || !Object.prototype.propertyIsEnumerable.call(shape, key),
  );
  if (hidden !== undefined) {
    throw new TypeError(`${name} key ${String(hidden)} is never read: a ${name} holds enumerable text keys only`);
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
 * Runs a built-in method that reads the slot of a Date, a Map or a Set, as {@link brand} does, unless the
 * value cannot have one: anything that is not an object, and an array. The method throws for those, and
 * a throw costs far more than the validation around it: 100,000 dates read from text by `coerceDate`
 * took 1.3 seconds, found by the audit of 0.3.0. `isArray` throws for a revoked proxy, so it is asked inside.
 */
const slot = <T>(value: unknown, read: () => T): T | undefined =>
  typeof value === "object" && value !== null ? brand(() => (Array.isArray(value) ? undefined : read())) : undefined;

/**
 * Reads `size` with the getter of a Map or Set prototype. It is looked up when called and not once at
 * load, because a call made while the module loads is never dropped from a bundle, and every consumer
 * would carry it.
 */
const sizeOf = (prototype: object, value: unknown): number | undefined => {
  const getter = Object.getOwnPropertyDescriptor(prototype, "size")?.get as (() => number) | undefined;
  return slot(value, () => getter?.call(value));
};

/**
 * Tests whether a value is an instance of a class with `instanceof`. A value the test throws for, such
 * as a revoked proxy or a proxy whose prototype trap throws, is not one.
 */
export const isInstance = (value: unknown, target: abstract new (...args: never[]) => unknown): boolean =>
  brand(() => value instanceof target) === true;

/** Tests whether a value is an array, in any realm. A revoked proxy, whose test throws, is not one. */
export const isArray = (value: unknown): value is unknown[] => brand(() => Array.isArray(value)) === true;

/** The moment a `Date` holds, `NaN` for an invalid one, or undefined when the value is not a `Date`, in any realm. */
export const timeOf = (value: unknown): number | undefined => slot(value, () => Date.prototype.getTime.call(value));

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

/**
 * The text of a `URLSearchParams`, or undefined when the value is not one, in any realm. It is read with
 * the built-in `toString`, which checks the value's own slot, so one from an iframe or with its prototype
 * swapped is read, and an object that only claims the prototype is not.
 */
export const queryOf = (value: unknown): string | undefined =>
  brand(() => URLSearchParams.prototype.toString.call(value as URLSearchParams));

/**
 * Reads a getter of a built-in prototype on a value. It is looked up when called, as `size` is, and checks
 * the value's own slot, so it throws for a value that only claims the prototype.
 */
const own = (prototype: object, key: string, value: unknown): unknown =>
  (Object.getOwnPropertyDescriptor(prototype, key)?.get as (() => unknown) | undefined)?.call(value);

/**
 * The size and declared media type of a `File`, or undefined when the value is not one, in any realm. Its
 * tag is asked first, so most values that are not a file are refused without the throw of a getter that
 * checks its slot, and a value that only claims the tag is refused by that throw. A `Blob` is no file: a
 * form sends a file with its name.
 */
export const fileOf = (value: unknown): { size: number; type: string } | undefined =>
  slot(value, () => {
    if (Object.prototype.toString.call(value) !== "[object File]") {
      return undefined;
    }
    own(File.prototype, "name", value);
    return { size: own(Blob.prototype, "size", value) as number, type: own(Blob.prototype, "type", value) as string };
  });

/**
 * The entries of a `FormData`, or undefined when the value is not one, in any realm, read with the built-in
 * iterator, which checks the value's own slot.
 */
export const formEntriesOf = (value: unknown): [string, unknown][] | undefined =>
  slot(value, () => [...FormData.prototype.entries.call(value as FormData)]);

/** The entries of a value already known to be a `Map`, read with the built-in iterator. */
export const entriesOf = (map: unknown): [unknown, unknown][] => [
  ...Map.prototype.entries.call(map as Map<unknown, unknown>),
];

/** The values of a value already known to be a `Set`, read with the built-in iterator. */
export const valuesOf = (set: unknown): unknown[] => [...Set.prototype.values.call(set as Set<unknown>)];

/**
 * Sets an own enumerable property, so a key such as `__proto__` becomes data instead of a prototype write.
 * A key the target does not have, its prototypes included, is assigned, since nothing can stand between
 * an assignment and a key nobody holds, and defining each property took 45% of the time of an `object`
 * of three strings. Any other is defined, since assigning it would run a setter a prototype holds, or
 * fail for a property one holds read-only, as every member of a frozen `Object.prototype` is.
 */
export function setOwn(target: object, key: string, value: unknown): void {
  if (key in target) {
    Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
  } else {
    (target as Record<string, unknown>)[key] = value;
  }
}

/**
 * The issue for an input that is not a plain object. An object that has a prototype of its own is
 * named as such, since `received: "object"` beside `expected: "object"` would explain nothing.
 */
export function objectIssue(input: unknown): ValidationIssue {
  const received = describeType(input);
  return issue("invalid_type", {
    expected: "object",
    received: received === "object" && !isPlainObject(input) ? "non-plain object" : received,
  });
}
