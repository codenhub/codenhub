import { split } from "../core/checks";
import type { Factory } from "../core/types";
import { toIpAddress, type IpOptions } from "./ip";
import { stringFormat } from "./text-format";

/** A prefix length in decimal without leading zeros. */
const PREFIX_PATTERN = /^(?:0|[1-9]\d{0,2})$/;

/** The canonical spelling of a CIDR block the family allows, or undefined when the text is not one. */
const toCidr = (text: string, version: "v4" | "v6" | undefined): string | undefined => {
  const slash = text.indexOf("/");
  const prefix = text.slice(slash + 1);
  // A zone names an interface, which a block of addresses has none of.
  const address = slash === -1 || text.includes("%") ? undefined : toIpAddress(text.slice(0, slash), version);
  if (address === undefined || !PREFIX_PATTERN.test(prefix)) {
    return undefined;
  }
  return Number(prefix) <= (address.includes(":") ? 128 : 32) ? `${address}/${prefix}` : undefined;
};

/**
 * Creates a validator for IP address blocks in CIDR notation, an address and a prefix length, such as
 * `192.168.0.0/24` or `2001:db8::/32`. The prefix is at most 32 for IPv4 and 128 for IPv6. The value is
 * the address in the canonical spelling `ip` gives it and the prefix, so one block is one value.
 *
 * @remarks
 * Bits set past the prefix are accepted, as in `192.168.0.5/24`, which names an address and its network.
 *
 * @example
 * ```ts
 * cidr()("10.0.0.0/8"); // { ok: true, value: "10.0.0.0/8" }
 * cidr()("2001:DB8:0::/32"); // { ok: true, value: "2001:db8::/32" }
 * cidr({ version: "v4" })("10.0.0.0/33"); // { ok: false, ... }, params { format: "cidrv4" }
 * ```
 *
 * @throws {TypeError} When `version` is given and is not `"v4"` or `"v6"`.
 */
export const cidr = ((...args: unknown[]) => {
  const [{ version, message }, checks] = split<IpOptions, string>(args);
  if (version !== undefined && version !== "v4" && version !== "v6") {
    throw new TypeError(`version must be "v4" or "v6", received "${String(version)}"`);
  }
  return stringFormat(
    version === undefined ? "cidr" : `cidr${version}`,
    (text) => toCidr(text, version),
    message,
    checks,
  );
}) as Factory<string, IpOptions>;
