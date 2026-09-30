import { split } from "../core/checks";
import type { Factory, MessageOptions } from "../core/types";
import { IPV4_PATTERN } from "./patterns";
import { stringFormat } from "./text-format";

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
  // A leading `::` stands for zero groups, so the address starts with 0 whatever group is written next.
  const first = head === "" && isCompressed ? 0 : Number.parseInt(groups[0] ?? "", 16);
  return IPV6_ZONE_PATTERN.test(zone) && (first & LINK_LOCAL_MASK) === LINK_LOCAL_PREFIX;
}

/** Options for {@link ip}. */
export interface IpOptions extends MessageOptions {
  /** Restricts the address family. Both are accepted when omitted. */
  version?: "v4" | "v6";
}

/**
 * The canonical spelling of an IP address the family allows, or undefined when the text is not one:
 * an IPv4 address as written, which has one spelling, and an IPv6 address as the URL parser writes it,
 * lowercase with the longest run of zero groups shortened (RFC 5952), and its zone as written.
 */
export function toIpAddress(text: string, version: "v4" | "v6" | undefined): string | undefined {
  if (version !== "v6" && IPV4_PATTERN.test(text)) {
    return text;
  }
  if (version === "v4" || !isIpv6(text)) {
    return undefined;
  }
  const zoneStart = text.indexOf("%");
  const address = zoneStart === -1 ? text : text.slice(0, zoneStart);
  const zone = zoneStart === -1 ? "" : text.slice(zoneStart);
  return `${new URL(`http://[${address}]`).hostname.slice(1, -1)}${zone}`;
}

/**
 * Creates a validator for IPv4 and IPv6 addresses. The value is the canonical spelling, so one address
 * is one value however it was written: an IPv4 address as written, and an IPv6 address lowercase with
 * the longest run of zero groups shortened to `::`, as RFC 5952 and the URL parser write it.
 *
 * @remarks
 * An IPv6 address that embeds an IPv4 one, such as `::ffff:192.0.2.1`, is written in hex groups,
 * `::ffff:c000:201`, as the URL parser writes it.
 *
 * @example
 * ```ts
 * ip()("192.168.0.1"); // { ok: true, value: "192.168.0.1" }
 * ip()("0:0:0:0:0:0:0:1"); // { ok: true, value: "::1" }
 * ip({ version: "v6" })("192.168.0.1"); // { ok: false, ... }, params { format: "ipv6" }
 * ```
 *
 * @throws {TypeError} When `version` is given and is not `"v4"` or `"v6"`.
 */
export const ip = ((...args: unknown[]) => {
  const [{ version, message }, checks] = split<IpOptions, string>(args);
  if (version !== undefined && version !== "v4" && version !== "v6") {
    throw new TypeError(`version must be "v4" or "v6", received "${String(version)}"`);
  }
  return stringFormat(
    version === undefined ? "ip" : `ip${version}`,
    (text) => toIpAddress(text, version),
    message,
    checks,
  );
}) as Factory<string, IpOptions>;
