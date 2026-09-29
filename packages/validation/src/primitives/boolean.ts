import { invalidType, pass } from "../core/result";
import type { Validator } from "../core/types";

/**
 * Creates a validator for booleans. Only `true` and `false` pass; to accept text such as `"yes"`, use
 * the coercing variant.
 *
 * @example
 * ```ts
 * boolean()(true); // { ok: true, value: true }
 * boolean()("true"); // { ok: false, error: { issues: [{ code: "invalid_type", ... }] } }
 * ```
 *
 * @returns A validator that produces a boolean.
 */
export function boolean(): Validator<boolean> {
  return (input) => (typeof input === "boolean" ? pass(input) : invalidType("boolean", input));
}
