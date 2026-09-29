import { pass } from "../core/result";
import type { Validator } from "../core/types";

/**
 * Creates a validator that accepts any value and passes it through unchanged. Use it for a property
 * whose content you do not check, or as the start of a `pipe`.
 *
 * @example
 * ```ts
 * unknown()({ anything: [1, 2, 3] }); // { ok: true, value: { anything: [1, 2, 3] } }
 * ```
 *
 * @returns A validator that produces `unknown`.
 */
export function unknown(): Validator<unknown> {
  return (input) => pass(input);
}
