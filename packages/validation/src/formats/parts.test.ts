import { describe, expect, it } from "vitest";

import { check } from "../builders/check";
import { startsWith } from "../checks/starts-with";
import { coerceNumber } from "../coercion/coerce-number";
import { array } from "../composition/array";
import { object } from "../composition/object";
import { optional } from "../composition/optional";
import { union } from "../composition/union";
import { literal } from "../primitives/literal";
import { oneOf } from "../primitives/one-of";
import { string } from "../primitives/string";
import { unknown } from "../primitives/unknown";
import { accepts, isFree, issuesOf, isPending, valueOf } from "../test-utils";
import { domain } from "./domain";
import { email } from "./email";
import { hostname } from "./hostname";
import { ip } from "./ip";
import { port } from "./port";
import { searchParams } from "./search-params";
import { url } from "./url";

describe("url parts", () => {
  it("should replace the public-domain rule with a host validator", () => {
    expect(accepts(url({ host: hostname() }), "http://localhost:3000", "http://127.0.0.1/")).toEqual([true, false]);
    expect(
      accepts(url({ host: union([domain(), ip()]) }), "http://127.0.0.1/", "http://[::1]/", "http://localhost/"),
    ).toEqual([true, true, false]);
    expect(
      accepts(url({ host: oneOf(["api.example.com"]) }), "https://api.example.com/x", "https://example.com/"),
    ).toEqual([true, false]);
  });

  it("should give the host as the parser reads it, an IPv6 address without brackets", () => {
    const seen: unknown[] = [];
    const spy = url({ host: unknown(check((host) => (seen.push(host), true))) });
    spy("https://EXAMPLE.com/");
    spy("http://[0:0::1]/");
    spy("http://0x7f000001/");
    expect(seen).toEqual(["example.com", "::1", "127.0.0.1"]);
  });

  it("should give the port as a number, or undefined when none or the default is written", () => {
    const fixed = url({ port: literal(8080) });
    expect(accepts(fixed, "https://example.com:8080/", "https://example.com/", "https://example.com:443/")).toEqual([
      true,
      false,
      false,
    ]);
    expect(accepts(url({ port: optional(port()) }), "https://example.com/", "https://example.com:8443/")).toEqual([
      true,
      true,
    ]);
  });

  it("should give the path as the parser writes it", () => {
    const api = url({ path: string(startsWith("/api/")) });
    expect(
      accepts(api, "https://example.com/api/users", "https://example.com/other/../api/x", "https://example.com/x/api/"),
    ).toEqual([true, true, false]);
  });

  it("should give the query as an object of decoded parameters, and reject a repeated key", () => {
    const search = url({ query: object({ q: string(), page: optional(string()) }, { unknownKeys: "strict" }) });
    expect(valueOf(search("https://example.com/?q=red+shoes"))).toBe("https://example.com/?q=red+shoes");
    expect(
      accepts(search, "https://example.com/?q=%C3%A9", "https://example.com/", "https://example.com/?q=a&x=1"),
    ).toEqual([true, false, false]);
    expect(issuesOf(search("https://example.com/?q=a&q=b"))).toEqual([
      {
        code: "invalid_key",
        path: ["query", "q"],
        params: { issues: [{ code: "invalid_value", path: [], params: { unique: true } }] },
      },
    ]);
  });

  it("should give every value as an array with repeated", () => {
    const tags = url({ query: object({ tag: array(string()) }), repeated: true });
    expect(accepts(tags, "https://example.com/?tag=a&tag=b", "https://example.com/?tag=a")).toEqual([true, true]);
  });

  it("should place a part's issues under its name, and word none of them with the message", () => {
    const strict = url({ message: "Bad URL", host: oneOf(["example.com"], { message: "Wrong host" }) });
    expect(issuesOf(strict("https://other.com/"))).toEqual([
      { code: "invalid_value", path: ["host"], params: { options: ["example.com"] }, message: "Wrong host" },
    ]);
    expect(issuesOf(strict("nope"))[0]?.message).toBe("Bad URL");
  });

  it("should return the whole URL, whatever a part converts its value to", () => {
    const converting = url({ query: object({ page: coerceNumber() }) });
    expect(valueOf(converting("https://example.com/?page=2"))).toBe("https://example.com/?page=2");
  });

  it("should turn asynchronous with an asynchronous part, and only then", async () => {
    const remote = url({ path: isFree });
    const pending = remote("https://example.com/taken");
    expect(isPending(pending)).toBe(true);
    expect((await pending).ok).toBe(true);
    expect(isPending(url({ path: string() })("https://example.com/"))).toBe(false);
  });

  it("should not apply parts to a URL without a host", () => {
    const mail = url({ protocols: ["mailto"], host: oneOf(["nothing"]) });
    expect(mail("mailto:ada@example.com").ok).toBe(true);
  });
});

describe("email parts", () => {
  it("should replace the public-domain rule with a domain validator, still requiring a hostname", () => {
    expect(accepts(email({ domain: hostname() }), "ada@localhost", "ada@exa_mple")).toEqual([true, false]);
    expect(accepts(email({ domain: oneOf(["company.com"]) }), "ada@company.com", "ada@other.com")).toEqual([
      true,
      false,
    ]);
  });

  it("should give the domain in ASCII and the local part as written, placing issues under their names", () => {
    const corporate = email({ domain: oneOf(["xn--mnchen-3ya.de"]), local: string({ max: 3 }) });
    expect(valueOf(corporate("Ada@München.DE"))).toBe("Ada@xn--mnchen-3ya.de");
    expect(issuesOf(corporate("adalovelace@münchen.de")).map((issue) => issue.path)).toEqual([["local"]]);
  });

  it("should word its own issue, and run checks on the address", () => {
    expect(issuesOf(email({ message: "Email please" })("nope"))[0]?.message).toBe("Email please");
    expect(
      accepts(email(check((address) => !address.startsWith("admin"))), "ada@example.com", "admin@example.com"),
    ).toEqual([true, false]);
  });
});

describe("searchParams", () => {
  const filters = searchParams(object({ page: coerceNumber({ int: true, min: 1 }), q: optional(string()) }));

  it("should read a query string, with or without its ?, into typed values", () => {
    expect(valueOf(filters("?page=2&q=red+shoes"))).toEqual({ page: 2, q: "red shoes" });
    expect(valueOf(filters("page=1"))).toEqual({ page: 1 });
    expect(valueOf(filters(new URLSearchParams("page=3")))).toEqual({ page: 3 });
  });

  it("should report the validator's issues at the parameter's path", () => {
    expect(issuesOf(filters("page=0")).map((issue) => issue.path)).toEqual([["page"]]);
  });

  it("should reject a repeated key unless repeated is set", () => {
    expect(issuesOf(filters("page=1&page=2"))[0]).toMatchObject({ code: "invalid_key", path: ["page"] });
    const tags = searchParams(object({ tag: array(string()) }), { repeated: true });
    expect(valueOf(tags("tag=a&tag=b"))).toEqual({ tag: ["a", "b"] });
  });

  it("should keep a key named like a prototype member as a parameter", () => {
    const value = valueOf(searchParams(unknown())("__proto__=x")) as Record<string, unknown>;
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(Object.hasOwn(value, "__proto__")).toBe(true);
  });

  it("should reject what is not a query string", () => {
    expect(issuesOf(filters(1))).toEqual([
      { code: "invalid_type", path: [], params: { expected: "query string", received: "number" } },
    ]);
  });
});
