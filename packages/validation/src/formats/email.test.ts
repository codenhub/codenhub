import { describe, expect, it } from "vitest";

import { accepts, codesOf, issuesOf, valueOf } from "../test-utils";
import { email } from "./email";
import { url } from "./url";

describe("email", () => {
  it("should keep the local part as written and return the domain as the parser writes it", () => {
    expect(valueOf(email()("Me.Name+tag@Example.COM"))).toBe("Me.Name+tag@example.com");
  });

  it("should accept subdomains and internationalized top-level domains in punycode", () => {
    expect(accepts(email(), "a@mail.example.co.uk", "a@example.xn--p1ai")).toEqual([true, true]);
  });

  it("should accept an internationalized domain and return it in the ASCII form mail is delivered to", () => {
    expect(valueOf(email()("ada@münchen.de"))).toBe("ada@xn--mnchen-3ya.de");
    expect(accepts(email(), "ada@例え.jp", "ada@bücher.example.co.uk", "ada@xn--mnchen-3ya.de")).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("should reject a punycode label that does not decode, in any position", () => {
    const invalid = ["a@example.xn--zz", "a@xn--zz.com", "a@XN--ZZ.example.com", "a@a.xn--a"];
    expect(accepts(email(), ...invalid)).toEqual(invalid.map(() => false));
    expect(accepts(email(), "a@a.xn--ls8h", "a@XN--MNCHEN-3YA.de")).toEqual([true, true]);
    const local = url({ protocols: ["mailto"], allowLocal: true });
    expect(accepts(local, "mailto:a@xn--zz", "mailto:a@xn--mnchen-3ya")).toEqual([false, true]);
  });

  it("should return the domain the parser reads when the text spells it another way, so one address has one spelling", () => {
    expect(valueOf(email()("ada@\uff45xample.com"))).toBe("ada@example.com");
    expect(valueOf(email()("ada@mu\u0308nchen.de"))).toBe("ada@xn--mnchen-3ya.de");
    expect(valueOf(email()("ada@\ufb01sh.com"))).toBe("ada@fish.com");
    expect(valueOf(email()("ada@exa\ufe0fmple.com"))).toBe("ada@example.com");
  });

  it("should read the full stops IDNA maps to a dot as dots, as url does", () => {
    for (const stop of ["\u3002", "\uff0e", "\uff61"]) {
      expect(valueOf(email()(`ada@example${stop}com`))).toBe("ada@example.com");
      expect(valueOf(url()(`https://example${stop}com/`))).toBe("https://example.com/");
    }
  });

  it("should measure the address as it is delivered, where an internationalized host is longer", () => {
    const label = Array.from({ length: 26 }, (_, index) => String.fromCodePoint(0x4e00 + index * 7)).join("");
    const host = `${label}.${label}.${label}.${label}.com`;
    const address = `${"a".repeat(64)}@${host}`;
    expect(address.length).toBeLessThan(254);
    expect(email()(address).ok).toBe(false);
    expect(email()(`a@${host}`).ok).toBe(true);
  });

  it("should reject a non-ASCII local part", () => {
    expect(accepts(email(), "ü@example.com", "用户@example.com")).toEqual([false, false]);
  });

  it("should reject an internationalized host that is not a public domain name or not a host at all", () => {
    expect(
      accepts(
        email(),
        "a@münchen",
        "a@münchen.test",
        "a@münchen.de/x",
        "a@münchen.de:80",
        "a@m%C3%BCnchen.de",
        "a@münchen.de?x",
        "a@münch en.de",
        `a@${"ü".repeat(60)}.${"ü".repeat(60)}.${"ü".repeat(60)}.com`,
      ),
    ).toEqual(Array(8).fill(false));
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
