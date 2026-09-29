import { failIssue, pass } from "../core/result";
import type { Validator } from "../core/types";

/** A value a validator can require exactly: any primitive, including `null` and `undefined`. */
export type LiteralValue = string | number | boolean | bigint | symbol | null | undefined;

/**
 * Creates a validator that accepts exactly one value, compared with `===`. The type is the value
 * itself, so `literal("admin")` produces `"admin"` and not `string`. It is also how `null` and
 * `undefined` are validated: `literal(null)`.
 *
 * @example
 * ```ts
 * const role = literal("admin");
 * role("admin"); // { ok: true, value: "admin" }
 * role("user"); // { ok: false, ... }, code "invalid_value", params { expected: "admin" }
 * ```
 *
 * @typeParam T - The literal type.
 * @param value - The only accepted value.
 * @returns A validator that produces `value`.
 */
export function literal<const T extends LiteralValue>(value: T): Validator<T> {
  return (input) => (input === value ? pass(value) : failIssue("invalid_value", { expected: value }));
}
