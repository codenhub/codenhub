/**
 * Checks for a plain object from any realm: its prototype is null or an `Object.prototype`, so an array, a Date, a
 * Map, a class instance, or an object built with `Object.create(defaults)` is not one. @internal
 */
export function isPlainObject(value: unknown): value is object {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
}
