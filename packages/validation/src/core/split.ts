import { isPlainObject } from "./objects";
import { CHECK } from "./run";
import type { AsyncCheck, MessageOptions } from "./types";

/**
 * Separates the arguments of a factory, `(options?, ...checks)`, into its options and its checks. A plain
 * object is the options and a function is a check, so the options can be left out. Anything else in
 * first place, such as a string, a list or a regular expression, is a mistake in the schema: read as
 * options, `string("abc")` would take the string's `length` as its own, `array(item, [unique()])` would
 * drop the check, and `string(/^a/)` would accept every string. `null` is no options, as `undefined` is.
 * An option whose name is not `message` or one of `known`, the names the factory reads separated by
 * spaces, is a mistake too, such as `max` written `maxx`, which would otherwise leave the limit unset.
 * The error names the option and not the ones there are, which the types list, since every validator carries it.
 */
export function split<TOptions extends MessageOptions, T>(
  args: readonly unknown[],
  known = "",
): [options: TOptions, checks: AsyncCheck<T>[]] {
  const [first, ...rest] = args;
  const [options, checks] = typeof first === "function" ? [{}, args] : [first ?? {}, rest];
  const message: unknown = (options as MessageOptions | null)?.message;
  if (
    !isPlainObject(options) ||
    (message !== undefined && typeof message !== "string" && typeof message !== "function") ||
    // A function written by hand is not a check until `check` made it one: what runs it comes with it.
    // Nor is a check another copy of the package made, whose issues this copy would not see.
    checks.some((check) => typeof check !== "function" || !(CHECK in check))
  ) {
    // A mistake in the schema, reported now rather than on the first input. One condition and one text,
    // since every validator carries them.
    throw new TypeError("Options must be an object whose message is text or a function, and checks made with check()");
  }
  // Splitting no names gives one empty name, which no option is.
  const names = `message ${known}`.split(" ");
  const unknown = Object.keys(options).find((name) => name === "" || !names.includes(name));
  if (unknown !== undefined) {
    throw new TypeError(`Unknown option ${unknown}`);
  }
  // Copied, so changing the object after the validator is made changes nothing, whether the validator reads
  // an option once or, as a composer reads its message and sizes, on every call.
  return [Object.freeze({ ...(options as object) }) as TOptions, checks as AsyncCheck<T>[]];
}
