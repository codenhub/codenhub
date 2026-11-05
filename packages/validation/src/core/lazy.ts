import { describe } from "./describe";
import type { AnyValidator } from "./types";

/** The validator each `lazy` returned from its getter, once it has called it. */
const resolvedLazies = new WeakMap<object, unknown>();

/** Records what the getter of the `lazy` `validator` returned, so it is read without calling it again. */
export const keepResolved = (validator: object, resolved: unknown): void => {
  resolvedLazies.set(validator, resolved);
};

/** What the getter of the `lazy` `validator` returned, or `undefined` if it was never called. */
export const resolvedOf = (validator: unknown): unknown =>
  typeof validator === "function" ? resolvedLazies.get(validator) : undefined;

/**
 * Adds to `found` the getters of the `lazy` parts a validator holds, short of what those parts refer to.
 * A part reached twice is read once, since parts a schema shares would otherwise be read once for each way to them.
 */
function addGetters(part: unknown, found: Set<unknown>, seen: Set<unknown>): void {
  const record = describe(part as AnyValidator);
  if (record === undefined || seen.has(part)) {
    return;
  }
  seen.add(part);
  if (record.kind === "lazy") {
    found.add(record["getter"]);
    return;
  }
  for (const value of Object.values(record)) {
    // A child is a validator, or is in a list, such as `steps`, or in a record, such as `shape`.
    const children: unknown[] =
      typeof value === "function" ? [value] : typeof value === "object" && value !== null ? Object.values(value) : [];
    for (const child of children) {
      addGetters(child, found, seen);
    }
  }
}

/**
 * Whether a getter makes new `lazy` parts each time it is called, as `lazy(() => build())` does, so that
 * following them never comes back to one already walked. A getter that returns a schema built once, or
 * builds a part around `lazy` parts that exist already, makes none.
 */
export function makesNewLazy(getter: () => unknown, first: unknown): boolean {
  const again = getter();
  if (again === first) {
    return false;
  }
  const before = new Set<unknown>();
  const after = new Set<unknown>();
  addGetters(first, before, new Set());
  addGetters(again, after, new Set());
  return [...after].some((each) => !before.has(each));
}
