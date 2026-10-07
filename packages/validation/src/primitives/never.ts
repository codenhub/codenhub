import { leaf, split } from "../core/checks";
import { described } from "../core/describe";
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
  const [options, checks] = split<MessageOptions, never>(args);
  const { message } = options;
  return described(leaf("never", nothing, message, checks), { kind: "never", options, checks });
}) as Factory<never, MessageOptions>;
