/**
 * Shape checks every entry point that reads caller or untrusted values shares, so a value from another
 * realm, such as a Jest, jsdom or `vm` sandbox's, is accepted the same way everywhere. None runs a getter
 * or method of the value it checks; a `Proxy`'s `getPrototypeOf` trap can still run and throw, so a caller
 * reading untrusted input calls these inside its own `try`.
 */

/**
 * Whether `prototype` is some realm's `Object.prototype`: its own prototype is null and its own
 * `constructor` is a function named `Object` that points back at it.
 */
function isObjectPrototype(prototype: unknown): boolean {
  if (prototype === Object.prototype) {
    return true;
  }
  if (typeof prototype !== "object" || prototype === null || Object.getPrototypeOf(prototype) !== null) {
    return false;
  }
  const constructor = Object.getOwnPropertyDescriptor(prototype, "constructor")?.value as unknown;
  return typeof constructor === "function" && constructor.name === "Object" && constructor.prototype === prototype;
}

/**
 * Whether `value` is a plain object of this realm or another one: not an array, and its prototype is null
 * or is a realm's `Object.prototype`. A class instance, whose prototype has `Object.prototype` above it,
 * is not.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === null || isObjectPrototype(prototype);
}

/**
 * Whether `value` is a plain array of this realm or another one: `Array.isArray`, and its prototype is a
 * realm's own `Array.prototype` (a `constructor` named `Array` pointing back at it) with that realm's
 * `Object.prototype` above it. An `Array` subclass, or an array whose prototype was swapped, is not.
 */
export function isPlainArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype === Array.prototype) {
    return true;
  }
  if (typeof prototype !== "object" || prototype === null || !isObjectPrototype(Object.getPrototypeOf(prototype))) {
    return false;
  }
  const constructor = Object.getOwnPropertyDescriptor(prototype, "constructor")?.value as unknown;
  return typeof constructor === "function" && constructor.name === "Array" && constructor.prototype === prototype;
}
