import { leaf, split } from "../core/checks";
import { described } from "../core/describe";
import { isInstance } from "../core/objects";
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
 * @throws {TypeError} When `target` is not a function `instanceof` can test against, such as an arrow function,
 * or its `Symbol.hasInstance` is neither a function nor absent, which would make `instanceof` throw for every value.
 */
export function instanceOf<T>(target: Constructor<T>, ...rest: Rest<T, MessageOptions>): Validator<T, T>;
export function instanceOf<T>(target: Constructor<T>, ...rest: AsyncRest<T, MessageOptions>): AsyncValidator<T, T>;
export function instanceOf(target: Constructor, ...rest: unknown[]): AnyValidator {
  assertFunction("target", target);
  // `instanceof` treats a `Symbol.hasInstance` of null or undefined as absent and tests the prototype, and
  // throws for any other value that is not a function, on every value it is given.
  const rule: unknown = target[Symbol.hasInstance];
  if (rule !== undefined && rule !== null && typeof rule !== "function") {
    throw new TypeError("target's Symbol.hasInstance must be a function");
  }
  // A target with a rule of its own decides by it, and it is not run on an object made up here, since
  // it may accept only some shapes and throw for the rest. Without one, the prototype is tested.
  const hasOwnRule = typeof rule === "function" && rule !== Function.prototype[Symbol.hasInstance];
  try {
    // An arrow or a method has no prototype, so `instanceof` would throw on every object given to it.
    if (!hasOwnRule) {
      // oxlint-disable-next-line no-unused-expressions
      ({}) instanceof target;
    }
  } catch {
    throw new TypeError("target must be a class or a function with a prototype");
  }
  const [options, checks] = split<MessageOptions, unknown>(rest);
  const { message } = options;
  return described(
    leaf(
      `instance of ${target.name || "anonymous class"}`,
      (input) => isInstance(input, target),
      message,
      checks,
      undefined,
      // A class with a `Symbol.hasInstance` of its own runs the consumer's code on `instanceof`, which a
      // fast test would run a second time for an invalid value.
      target[Symbol.hasInstance] === Function.prototype[Symbol.hasInstance],
    ),
    { kind: "instance", options, checks, target },
  );
}
