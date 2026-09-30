import { leaf, split } from "../core/checks";
import type { Factory, MessageOptions } from "../core/types";

const nothing = (): boolean => false;

/**
 * Creates a validator that rejects every value, with `invalid_type` and `params.expected` `"never"`. It
 * marks a property that must be absent: `optional(never())`.
 *
 * @example
 * ```ts
 * never()(1); // { ok: false, ... }, params { expected: "never", received: "number" }
 * ```
 */
export const never = ((...args: unknown[]) => {
  const [{ message }, checks] = split<MessageOptions, never>(args);
  return leaf("never", nothing, message, checks);
}) as Factory<never, MessageOptions>;
