import type { Factory, MessageOptions } from "../core/types";
import { boolean } from "../primitives/boolean";
import { coercing } from "./coerce";

const TRUE_WORDS = new Set(["true", "1", "yes", "on"]);
const FALSE_WORDS = new Set(["false", "0", "no", "off"]);

/**
 * Creates a validator for booleans that also accepts the words `true`/`false`, `yes`/`no`, `on`/`off`
 * and `1`/`0`, in any letter case and ignoring surrounding whitespace, and the numbers `1` and `0`.
 *
 * @remarks
 * Anything else is rejected, so a typo such as `"ture"` is an error and not `false`. A value that
 * cannot be converted fails with `invalid_type` and `coerced: true` in `params`. Combine with
 * `optional` with a default for an environment variable that may be missing.
 *
 * @example
 * ```ts
 * coerceBoolean()("yes"); // { ok: true, value: true }
 * coerceBoolean()("Off"); // { ok: true, value: false }
 * coerceBoolean()("maybe"); // { ok: false, ... }, code "invalid_type"
 * ```
 *
 * @returns A validator that produces a boolean.
 */
export const coerceBoolean = ((...args: unknown[]) =>
  coercing("boolean", boolean(...(args as [])), args, (input) => {
    if (typeof input === "boolean") {
      return [input];
    }
    if (typeof input !== "string" && typeof input !== "number") {
      return undefined;
    }
    const word = String(input).trim().toLowerCase();
    return TRUE_WORDS.has(word) ? [true] : FALSE_WORDS.has(word) ? [false] : undefined;
  })) as Factory<boolean, MessageOptions, boolean | number | string>;
