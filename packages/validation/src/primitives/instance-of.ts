import { leaf, split } from "../core/checks";
import { assertFunction } from "../core/result";
import type { AnyValidator, AsyncRest, AsyncValidator, MessageOptions, Rest, Validator } from "../core/types";

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
 * @param rest - Options, then checks.
 * @returns A validator that produces the instance.
 * @throws {TypeError} When `target` is not a function.
 */
export function instanceOf<T>(target: Constructor<T>, ...rest: Rest<T, MessageOptions>): Validator<T>;
export function instanceOf<T>(target: Constructor<T>, ...rest: AsyncRest<T, MessageOptions>): AsyncValidator<T>;
export function instanceOf(target: Constructor, ...rest: unknown[]): AnyValidator {
  assertFunction("target", target);
  const [{ message }, checks] = split<MessageOptions, unknown>(rest);
  return leaf(`instance of ${target.name || "anonymous class"}`, (input) => input instanceof target, message, checks);
}
