import type { Validator } from "../core/types";
import { textFormat } from "./text-format";

const IPV4_PATTERN =
  /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
const IPV6_PATTERN =
  /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/i;

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
 */
export function ip(options: IpOptions = {}): Validator<string> {
  const { version } = options;
  return textFormat(
    version === undefined ? "ip" : `ip${version}`,
    (text) => (version !== "v6" && IPV4_PATTERN.test(text)) || (version !== "v4" && IPV6_PATTERN.test(text)),
  );
}
