import { leaf, split } from "../core/checks";
import { assertFunction } from "../core/result";
import type { AnyValidator, AsyncRest, AsyncValidator, MessageOptions, Rest, Validator } from "../core/types";

/** A class a value can be checked against, including abstract ones. */
export type Constructor<T = unknown> = abstract new (...args: never[]) => T;

/**
 * Creates a validator that accepts instances of a class, checked with `instanceof`. An instance
 * from another realm, such as an iframe, is not recognized, and neither is a value `instanceof` throws
 * for, such as a revoked proxy.
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
 * @param rest - Options, then checks.
 * @returns A validator that produces the instance.
 * @throws {TypeError} When `target` is not a function `instanceof` can test against, such as an arrow function.
 */
export function instanceOf<T>(target: Constructor<T>, ...rest: Rest<T, MessageOptions>): Validator<T>;
export function instanceOf<T>(target: Constructor<T>, ...rest: AsyncRest<T, MessageOptions>): AsyncValidator<T>;
export function instanceOf(target: Constructor, ...rest: unknown[]): AnyValidator {
  assertFunction("target", target);
  // A target with a `Symbol.hasInstance` of its own decides by its own rule, which is not run on an
  // object made up here, since it may accept only some shapes and throw for the rest.
  const hasOwnRule = target[Symbol.hasInstance] !== Function.prototype[Symbol.hasInstance];
  try {
    // An arrow or a method has no prototype, so `instanceof` would throw on every object given to it.
    if (!hasOwnRule) {
      // oxlint-disable-next-line no-unused-expressions
      ({}) instanceof target;
    }
  } catch {
    throw new TypeError("target must be a class or a function with a prototype");
  }
  const [{ message }, checks] = split<MessageOptions, unknown>(rest);
  const accepts = (input: unknown): boolean => {
    try {
      return input instanceof target;
    } catch {
      // A revoked proxy, or a proxy whose prototype trap throws, is not an instance of anything.
      return false;
    }
  };
  return leaf(`instance of ${target.name || "anonymous class"}`, accepts, message, checks);
}
