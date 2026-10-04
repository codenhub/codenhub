import { isPublicName, toAsciiHost } from "./patterns";
import { formatFactory } from "./text-format";

/**
 * Creates a validator for public domain names, such as `example.com` or `münchen.de`: at least two
 * labels, a last label of 2 to 63 letters or a punycode label, and none of the special-use names that
 * never name a public host, such as `localhost`, `.local`, `.internal`, `.test`, `.arpa`, `.home`,
 * `.corp`, `.mail`, `.localdomain` or an IDN test top-level domain such as `.テスト`. Whether the
 * top-level domain exists is not checked, so a name under any other label, such as `nas.lan`, passes. An absolute name, `example.com.`, is accepted and keeps its dot, which the 253-character
 * limit does not count. This is the rule `email` and `url` apply to their host by default, except that an
 * email address has no absolute form. The value is the domain as the URL parser reads it, lowercase
 * ASCII with an internationalized label in punycode, so `München.DE` is `xn--mnchen-3ya.de`.
 *
 * @remarks
 * To accept any hostname, such as `localhost` or `intranet`, use `hostname`. Whether the domain
 * resolves, or is registered, is not checked.
 *
 * @example
 * ```ts
 * domain()("Example.COM"); // { ok: true, value: "example.com" }
 * domain()("localhost"); // { ok: false, ... }, code "invalid_format"
 * ```
 */
export const domain = /* @__PURE__ */ formatFactory("domain", (text) => {
  const host = toAsciiHost(text);
  return host !== undefined && isPublicName(host) ? host : undefined;
});
