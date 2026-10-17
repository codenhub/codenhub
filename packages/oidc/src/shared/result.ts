import type { OidcErr, OidcFailure, OidcIssue, OidcOk } from "./types";

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
 * Other objects, such as a `Response`, are left as they are and not descended into. The walk uses its own
 * stack and visits each container once, and it never runs a getter.
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
      const child: unknown = descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
      if (isPlainContainer(child)) {
        pending.push(child);
      }
    }
  }
  return value;
}

/** Wraps a value into a successful, deep-frozen result. */
export const ok = <T>(value: T): OidcOk<T> => deepFreeze({ ok: true, value });

/** Builds a failed, deep-frozen result from one or more issues. */
export const fail = (...issues: [OidcIssue, ...OidcIssue[]]): OidcErr => deepFreeze({ ok: false, error: { issues } });

/** Builds a failed, deep-frozen result from a failure object carrying more than issues. */
export const failWith = <TFailure extends OidcFailure>(error: TFailure): OidcErr<TFailure> =>
  deepFreeze({ ok: false, error });
