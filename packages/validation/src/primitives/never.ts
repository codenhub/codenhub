import { describeType, failIssue } from "../core/result";
import type { Validator } from "../core/types";

/**
 * Creates a validator that rejects every value. Use it to forbid a property, or for a branch of a
 * union that must never match.
 *
 * @example
 * ```ts
 * never()("anything"); // { ok: false, ... }, code "invalid_type", params { expected: "never", received: "string" }
 * ```
 *
 * @returns A validator that produces `never`.
 */
export function never(): Validator<never> {
  return (input) => failIssue("invalid_type", { expected: "never", received: describeType(input) });
}
