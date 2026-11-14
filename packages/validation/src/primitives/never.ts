import { leaf } from "../core/leaf";
import { toValidator } from "../core/make";
import { split } from "../core/split";
import type { Factory, MessageOptions } from "../core/types";
import { TYPE_WORDS } from "../core/words";

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
  return toValidator(leaf("never", nothing, message, checks), { kind: "never", options, checks }, TYPE_WORDS);
}) as Factory<never, MessageOptions>;
