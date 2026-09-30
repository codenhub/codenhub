import { invalidType, pass } from "../core/result";
import type { Validator } from "../core/types";

/** Any function, whatever it takes and returns. */
export type AnyFunction = (...args: never[]) => unknown;

/**
 * Creates a validator for functions, such as a callback in a configuration object. Classes, arrow,
 * async and generator functions are all functions, and a function from another realm is one too.
 *
 * @remarks
 * Only that the value is a function can be checked at runtime: the parameters it takes and what it
 * returns cannot. Name the signature you expect as the type argument, and it is the type of the output,
 * taken on trust as a cast would be. Without one, the output is a function that takes any arguments and
 * returns `unknown`.
 *
 * @example
 * ```ts
 * const config = object({ onChange: func<(value: string) => void>() });
 * config({ onChange: (value: string) => console.log(value) }); // { ok: true, ... }
 * config({ onChange: "log" }); // { ok: false, ... }, params { expected: "function", received: "string" }
 * ```
 *
 * @typeParam T - The signature the function is expected to have. It is not checked.
 * @returns A validator that produces the function, unchanged.
 */
export function func<T extends AnyFunction = (...args: unknown[]) => unknown>(): Validator<T> {
  return (input) => (typeof input === "function" ? pass(input as T) : invalidType("function", input));
}
