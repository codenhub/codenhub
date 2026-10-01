import { split } from "../core/checks";
import type { Factory, MessageOptions } from "../core/types";
import { stringFormat } from "./text-format";

/** The nil and max UUIDs, which RFC 9562 defines apart from the versions, as all zeros and all ones. */
const SPECIAL_UUID_PATTERN = /^(?:0{8}-0{4}-0{4}-0{4}-0{12}|f{8}-f{4}-f{4}-f{4}-f{12})$/i;

/** Options for {@link uuid}. */
export interface UuidOptions extends MessageOptions {
  /** Requires this version, from 1 to 8. The nil and max UUIDs have no version and are then rejected. Any version when omitted. */
  version?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
}

/**
 * Creates a validator for UUIDs of version 1 to 8 in hyphenated form, in any letter case, and the nil
 * and max UUIDs. The value is the UUID in lowercase, the form RFC 9562 writes, so one UUID is one value
 * however it was written.
 *
 * @example
 * ```ts
 * uuid()("123e4567-e89b-12d3-a456-426614174000"); // { ok: true, value: "123e4567-e89b-12d3-a456-426614174000" }
 * uuid()("123E4567-E89B-12D3-A456-426614174000"); // { ok: true, value: "123e4567-e89b-12d3-a456-426614174000" }
 * uuid()("00000000-0000-0000-0000-000000000000"); // { ok: true, ... }, the nil UUID
 * uuid({ version: 7 })("123e4567-e89b-12d3-a456-426614174000"); // { ok: false, ... }, a version 1 UUID
 * ```
 *
 * @throws {RangeError} When `version` is not an integer from 1 to 8.
 */
export const uuid = ((...args: unknown[]) => {
  const [{ version, message }, checks] = split<UuidOptions, string>(args);
  if (version !== undefined && !(Number.isInteger(version) && version >= 1 && version <= 8)) {
    throw new RangeError(`version must be an integer from 1 to 8, received ${String(version)}`);
  }
  const pattern = new RegExp(
    `^[0-9a-f]{8}-[0-9a-f]{4}-${version ?? "[1-8]"}[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`,
    "i",
  );
  return stringFormat(
    "uuid",
    (text) =>
      pattern.test(text) || (version === undefined && SPECIAL_UUID_PATTERN.test(text)) ? text.toLowerCase() : undefined,
    message,
    checks,
  );
}) as Factory<string, UuidOptions>;
