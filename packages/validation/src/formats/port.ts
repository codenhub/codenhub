import { split } from "../core/checks";
import type { Factory, MessageOptions } from "../core/types";
import { formatLeaf } from "./text-format";

const isNumber = (input: unknown): boolean => typeof input === "number" && Number.isFinite(input);

/** The highest port TCP and UDP can address. */
const MAX_PORT = 65_535;

/**
 * Creates a validator for network ports: whole numbers from 1 to 65535. Port 0, which asks a system
 * for any free port, cannot be connected to and is rejected. A number that is not a port fails with
 * `invalid_format` and `params` `{ format: "port" }`; text is not a port, so read a port from text with
 * `pipe(coerceNumber(), port())`.
 *
 * @example
 * ```ts
 * port()(8080); // { ok: true, value: 8080 }
 * port()(70_000); // { ok: false, ... }, code "invalid_format"
 * url({ port: optional(port()) }); // a URL's port is a number, or absent
 * ```
 */
export const port = ((...args: unknown[]) => {
  const [{ message }, checks] = split<MessageOptions, number>(args);
  return formatLeaf<number>(
    "number",
    isNumber,
    "port",
    (value) => (Number.isInteger(value) && value >= 1 && value <= MAX_PORT ? value : undefined),
    message,
    checks,
  );
}) as Factory<number, MessageOptions>;
