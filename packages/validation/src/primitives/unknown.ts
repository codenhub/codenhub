import { leaf } from "../core/leaf";
import { toValidator } from "../core/make";
import { split } from "../core/split";
import type { Factory, MessageOptions } from "../core/types";
import { TYPE_WORDS } from "../core/words";

const always = (): boolean => true;

/**
 * Creates a validator that accepts every value, unchanged. Checks given to it run on any value, which
 * makes it the base for a rule about a value of no particular type.
 *
 * @example
 * ```ts
 * const metadata = object({ id: string(), extra: unknown() });
 * const serializable = unknown(check((value) => JSON.stringify(value) !== undefined, "Must be serializable"));
 * ```
 */
export const unknown = ((...args: unknown[]) => {
  const [options, checks] = split<MessageOptions, unknown>(args);
  const { message } = options;
  return toValidator(leaf("unknown", always, message, checks), { kind: "unknown", options, checks }, TYPE_WORDS);
}) as Factory<unknown, MessageOptions>;
