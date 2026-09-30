import { isHostname } from "./patterns";
import { formatFactory } from "./text-format";

/**
 * Creates a validator for hostnames: dot-separated labels of letters, digits and hyphens, at most 253 characters, whose last label is not a number, all digits or `0x` and hex digits, since the URL parser reads a name that ends that way as an IPv4 address (`0x7f000001` is `127.0.0.1`), and whose punycode labels, such as `xn--mnchen-3ya`, decode. An absolute name ending in one dot, such as `example.com.`, is accepted. Unlike `url`, single-label hosts such as `localhost` are accepted. The value is not modified.
 *
 * @example
 * ```ts
 * hostname()("localhost"); // { ok: true, value: "localhost" }
 * hostname()("-bad.com"); // { ok: false, ... }, code "invalid_format"
 * ```
 */
export const hostname = /* @__PURE__ */ formatFactory("hostname", (text) => (isHostname(text) ? text : undefined));
