import { invalidType, pass } from "../core/result";
import type { Validator } from "../core/types";

/** A class a value can be checked against, including abstract ones. */
export type Constructor<T = unknown> = abstract new (...args: never[]) => T;

/**
 * Creates a validator that accepts instances of a class, checked with `instanceof`. An instance
 * from another realm, such as an iframe, is not recognized.
 *
 * @example
 * ```ts
 * const upload = instanceOf(File);
 * upload(new File([], "a.txt")); // { ok: true, ... }
 * upload("a.txt"); // { ok: false, ... }, params { expected: "instance of File", received: "string" }
 * ```
 *
 * @typeParam T - The instance type.
 * @param target - The class the value must be an instance of.
 * @returns A validator that produces the instance.
 */
export function instanceOf<T>(target: Constructor<T>): Validator<T> {
  return (input) =>
    input instanceof target ? pass(input as T) : invalidType(`instance of ${target.name || "anonymous class"}`, input);
}
