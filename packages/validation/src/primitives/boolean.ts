import { leaf, split } from "../core/checks";
import { described } from "../core/describe";
import type { Factory, MessageOptions } from "../core/types";

const isBoolean = (input: unknown): input is boolean => typeof input === "boolean";

/**
 * Creates a validator for booleans. Only `true` and `false` pass; to accept text such as `"yes"`, use
 * the coercing variant.
 *
 * @example
 * ```ts
 * boolean()(true); // { ok: true, value: true }
 * boolean()("true"); // { ok: false, error: { issues: [{ code: "invalid_type", ... }] } }
 * boolean({ message: "Choose yes or no" });
 * ```
 */
export const boolean = ((...args: unknown[]) => {
  const [options, checks] = split<MessageOptions, boolean>(args);
  return described(leaf("boolean", isBoolean, options.message, checks), { kind: "boolean", options, checks });
}) as Factory<boolean, MessageOptions>;
