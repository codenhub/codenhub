/**
 * Checks for a plain object from any realm: its prototype is null or an `Object.prototype`, so an array, a Date, a
 * Map, a class instance, or an object built with `Object.create(defaults)` is not one. An `Object.prototype` from
 * another realm is recognized as a null-rooted prototype that has its own `isPrototypeOf`. @internal
 */
export function isPlainObject(value: unknown): value is object {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const prototype: unknown = Object.getPrototypeOf(value);
  return (
    prototype === null ||
    prototype === Object.prototype ||
    (Object.getPrototypeOf(prototype) === null && Object.hasOwn(prototype as object, "isPrototypeOf"))
  );
}
