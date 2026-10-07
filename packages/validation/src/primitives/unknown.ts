import { leaf, split } from "../core/checks";
import { described } from "../core/describe";
import type { Factory, MessageOptions } from "../core/types";

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
  return described(leaf("unknown", always, message, checks), { kind: "unknown", options, checks });
}) as Factory<unknown, MessageOptions>;
