import { describe, expect, it } from "vitest";

import { accepts, codesOf, issuesOf, valueOf } from "../test-utils";
import { email } from "./email";
import { hostname } from "./hostname";

describe("email", () => {
  it("should keep the local part as written and return the domain in lowercase", () => {
    expect(valueOf(email()("Me.Name+tag@Example.COM"))).toBe("Me.Name+tag@example.com");
    expect(valueOf(email()("ADA@MAIL.Example.Co.UK"))).toBe("ADA@mail.example.co.uk");
  });

  it("should accept subdomains", () => {
    expect(accepts(email(), "a@mail.example.co.uk", "a@a.b.c.example.com")).toEqual([true, true]);
  });

  it("should reject a domain with a letter beyond ASCII, which internationalEmail reads", () => {
    // The last is written with its accent apart, which the parser composes.
    const written = ["ada@münchen.de", "ada@例え.jp", "ada@bücher.example.co.uk", "ada@mu\u0308nchen.de"];
    expect(accepts(email(), ...written)).toEqual(written.map(() => false));
  });

  it("should reject a domain with a punycode label that decodes, in any position and letter case", () => {
    const valid = ["ada@xn--mnchen-3ya.de", "a@example.xn--p1ai", "a@a.xn--ls8h", "a@XN--MNCHEN-3YA.de"];
    expect(accepts(email(), ...valid)).toEqual(valid.map(() => false));
    // A domain validator replaces the rule that the domain is public, not the one that it is written in ASCII.
    const local = email({ domain: hostname() });
    expect(accepts(local, "a@intranet", "a@xn--mnchen-3ya", "a@xn--mnchen-3ya.de")).toEqual([true, false, false]);
  });

  it("should reject a domain with a punycode label that does not decode, in any position", () => {
    const invalid = ["a@example.xn--zz", "a@xn--zz.com", "a@XN--ZZ.example.com", "a@a.xn--a"];
    expect(accepts(email(), ...invalid)).toEqual(invalid.map(() => false));
    expect(email({ domain: hostname() })("a@xn--zz").ok).toBe(false);
  });

  it("should reject a domain the URL parser would read as another spelling of an ASCII one", () => {
    // A fullwidth letter, a ligature, a variation selector, and the full stops IDNA maps to a dot.
    const spelled = [
      "ada@\uff45xample.com",
      "ada@\uff45\uff58\uff41\uff4d\uff50\uff4c\uff45.\uff43\uff4f\uff4d",
      "ada@\ufb01sh.com",
      "ada@exa\ufe0fmple.com",
      "ada@example\u3002com",
      "ada@example\uff0ecom",
      "ada@example\uff61com",
    ];
    expect(accepts(email(), ...spelled)).toEqual(spelled.map(() => false));
  });

  it("should reject a non-ASCII local part", () => {
    expect(accepts(email(), "ü@example.com", "用户@example.com")).toEqual([false, false]);
  });

  it("should reject malformed addresses", () => {
    expect(
      accepts(
        email(),
        "plain",
        "@example.com",
        "a@",
        "a@@example.com",
        "a b@example.com",
        "a@localhost",
        "a@example",
        " a@example.com",
        "a..b@example.com",
        ".a@example.com",
      ),
    ).toEqual(Array(10).fill(false));
  });

  it("should reject overlong parts", () => {
    expect(email()(`${"a".repeat(65)}@example.com`).ok).toBe(false);
    expect(email()(`a@${"b".repeat(250)}.com`).ok).toBe(false);
  });

  it("should reject hosts that are not public domain names", () => {
    expect(accepts(email(), "a@127.0.0.1", "a@[::1]", "a@intranet")).toEqual([false, false, false]);
  });

  it("should reject a host the URL parser reads as an IPv4 address, whatever the domain validator", () => {
    const numeric = ["a@127.0.0.1", "a@2130706433", "a@0x7f000001", "a@0x7F.1", "a@example.123", "a@1.2.3.4."];
    expect(accepts(email(), ...numeric)).toEqual(numeric.map(() => false));
    expect(accepts(email({ domain: hostname() }), ...numeric)).toEqual(numeric.map(() => false));
  });

  it("should reject an absolute name, ending in a dot", () => {
    expect(accepts(email(), "a@example.com.", "a@example.com..")).toEqual([false, false]);
  });

  it("should reject special-use domain names, in any letter case", () => {
    expect(
      accepts(email(), "a@foo.localhost", "a@Mail.INTERNAL", "a@box.local", "a@x.test", "a@router.home.arpa"),
    ).toEqual(Array(5).fill(false));
  });

  it("should allow plus addressing by default and let it be forbidden", () => {
    expect(email()("a+b@example.com").ok).toBe(true);
    expect(email({ allowPlus: false })("a+b@example.com").ok).toBe(false);
  });

  it("should reject non-strings as invalid_type and bad strings as invalid_format", () => {
    expect(codesOf(email()(42))).toEqual(["invalid_type"]);
    expect(issuesOf(email()("nope"))).toEqual([{ code: "invalid_format", path: [], params: { format: "email" } }]);
  });

  it("should not echo the input", () => {
    expect(JSON.stringify(issuesOf(email()("hunter2")))).not.toContain("hunter2");
  });
});
