import type { JwtErr, JwtIssue, JwtOk } from "./types";

/** Tests whether a value is an array or an object as `{}` and `JSON.parse` make it. */
const isPlainContainer = (value: unknown): value is object => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (Array.isArray(value)) {
    return true;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * Freezes a value and every array and plain object reachable from it, then returns it.
 *
 * Other objects, such as byte arrays, which cannot be frozen while they hold elements, and objects another
 * module owns, are left as they are and not descended into. The walk uses its own stack, so a deep value
 * cannot overflow the call stack, and it visits each container once, so a cycle ends it.
 */
export function deepFreeze<T>(value: T): T {
  const pending: object[] = isPlainContainer(value) ? [value] : [];
  const seen = new Set<object>();
  while (pending.length > 0) {
    const current = pending.pop() as object;
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    Object.freeze(current);
    for (const key of Reflect.ownKeys(current)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(current, key);
      // An accessor's getter is not run: freezing must not execute code the value carries.
      const child: unknown = descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
      if (isPlainContainer(child)) {
        pending.push(child);
      }
    }
  }
  return value;
}

/** Wraps a value into a successful, deep-frozen result. The value is frozen in place, not copied. */
export const ok = <T>(value: T): JwtOk<T> => deepFreeze({ ok: true, value });

/** Builds a failed, deep-frozen result from one or more issues, kept in order and frozen in place. */
export const fail = (...issues: [JwtIssue, ...JwtIssue[]]): JwtErr => deepFreeze({ ok: false, error: { issues } });
