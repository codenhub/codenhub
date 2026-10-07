import { leaf, split } from "../core/checks";
import { described } from "../core/describe";
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
  const [options, checks] = split<MessageOptions, symbol>(args);
  const { message } = options;
  return described(leaf("symbol", isSymbol, message, checks), { kind: "symbol", options, checks });
}) as Factory<symbol, MessageOptions>;
