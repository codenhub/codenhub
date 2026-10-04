import { isPublicHost, toAsciiHost } from "./patterns";
import { formatFactory } from "./text-format";

/**
 * Creates a validator for public domain names, such as `example.com` or `münchen.de`: at least two
 * labels, a last label of 2 to 63 letters or a punycode label, and none of the special-use names that
 * never name a public host, such as `localhost`, `.local`, `.internal`, `.test`, `.arpa`, `.home`,
 * `.corp`, `.mail`, `.localdomain`, Kubernetes' `.svc` and `.cluster`, or an IDN test top-level domain
 * such as `.テスト`. Whether the top-level domain exists is not checked, so a name under any other label
 * passes, private ones in common use such as `nas.lan`, `a.private` or `a.intranet` included: block those
 * with a check of your own when they matter, and remember that a public name can still resolve to a
 * private address. An absolute name, `example.com.`, is rejected: it names the same host as `example.com`, and a second
 * spelling of one host would let it past a check that compares the value as a string, such as a list of
 * blocked hosts. This is the rule `email` and `url` apply to their host by default. The value is the domain as the URL parser reads it, lowercase
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
  return host !== undefined && isPublicHost(host) ? host : undefined;
});
