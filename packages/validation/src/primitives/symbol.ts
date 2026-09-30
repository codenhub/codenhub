import { leaf, split } from "../core/checks";
import type { Factory, MessageOptions } from "../core/types";

const isSymbol = (input: unknown): boolean => typeof input === "symbol";

/**
 * Creates a validator for symbols. To accept one symbol only, use `literal`.
 *
 * @example
 * ```ts
 * symbol()(Symbol("id")); // { ok: true, ... }
 * symbol()("id"); // { ok: false, ... }, code "invalid_type"
 * ```
 */
export const symbol = ((...args: unknown[]) => {
  const [{ message }, checks] = split<MessageOptions, symbol>(args);
  return leaf("symbol", isSymbol, message, checks);
}) as Factory<symbol, MessageOptions>;
