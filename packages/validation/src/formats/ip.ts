import type { Validator } from "../core/types";
import { textFormat } from "./text-format";

const IPV4_PATTERN =
  /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
const IPV6_GROUP_PATTERN = /^[0-9a-f]{1,4}$/i;
/** A zone names a network interface, such as `eth0`. */
const IPV6_ZONE_PATTERN = /^[0-9a-z._~-]+$/i;
const IPV6_GROUPS = 8;
/** The first group of a link-local address, `fe80::/10`, once masked to its top ten bits. */
const LINK_LOCAL_PREFIX = 0xfe80;
const LINK_LOCAL_MASK = 0xffc0;

/**
 * Tests an IPv6 address written as RFC 4291 allows: eight groups of one to four hex digits, one run
 * of zero groups shortened to `::`, and an IPv4 address in place of the last two groups. A zone
 * such as `%eth0` is allowed only after a link-local address, the one place it means something.
 */
function isIpv6(text: string): boolean {
  const zoneStart = text.indexOf("%");
  const zone = zoneStart === -1 ? undefined : text.slice(zoneStart + 1);
  let address = zoneStart === -1 ? text : text.slice(0, zoneStart);

  const lastColon = address.lastIndexOf(":");
  if (lastColon === -1) {
    return false;
  }
  const tail = address.slice(lastColon + 1);
  if (tail.includes(".")) {
    // The dotted tail stands for two groups, so it is replaced by two before counting.
    if (!IPV4_PATTERN.test(tail)) {
      return false;
    }
    address = `${address.slice(0, lastColon + 1)}0:0`;
  }

  const halves = address.split("::");
  const [head = "", rest = ""] = halves;
  if (halves.length > 2) {
    return false;
  }
  const groups = [...(head === "" ? [] : head.split(":")), ...(rest === "" ? [] : rest.split(":"))];
  const isCompressed = halves.length === 2;
  if (
    !groups.every((group) => IPV6_GROUP_PATTERN.test(group)) ||
    (isCompressed ? groups.length >= IPV6_GROUPS : groups.length !== IPV6_GROUPS)
  ) {
    return false;
  }
  if (zone === undefined) {
    return true;
  }
  const first = Number.parseInt(groups[0] ?? "", 16);
  return IPV6_ZONE_PATTERN.test(zone) && (first & LINK_LOCAL_MASK) === LINK_LOCAL_PREFIX;
}

/** Options for {@link ip}. */
export interface IpOptions {
  /** Restricts the address family. Both are accepted when omitted. */
  version?: "v4" | "v6";
}

/**
 * Creates a validator for IPv4 and IPv6 addresses. The value is not modified.
 *
 * @example
 * ```ts
 * ip()("192.168.0.1"); // { ok: true, ... }
 * ip({ version: "v6" })("192.168.0.1"); // { ok: false, ... }, params { format: "ipv6" }
 * ```
 *
 * @param options - Restricts the address family.
 * @returns A validator that produces the address as a string.
 * @throws {TypeError} When `version` is given and is not `"v4"` or `"v6"`.
 */
export function ip(options: IpOptions = {}): Validator<string> {
  const { version } = options;
  if (version !== undefined && version !== "v4" && version !== "v6") {
    throw new TypeError(`version must be "v4" or "v6", received "${String(version)}"`);
  }
  return textFormat(
    version === undefined ? "ip" : `ip${version}`,
    (text) => (version !== "v6" && IPV4_PATTERN.test(text)) || (version !== "v4" && isIpv6(text)),
  );
}
