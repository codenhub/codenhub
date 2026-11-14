import { leaf } from "../core/leaf";
import { toValidator } from "../core/make";
import { split } from "../core/split";
import type { Factory, MessageOptions } from "../core/types";
import { TYPE_WORDS } from "../core/words";

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
  return toValidator(leaf("symbol", isSymbol, message, checks), { kind: "symbol", options, checks }, TYPE_WORDS);
}) as Factory<symbol, MessageOptions>;
