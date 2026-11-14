import { describe, expect, it } from "vitest";

import { describe as describeSchema } from "../core/describe";
import { accepts, codesOf, issuesOf, valueOf } from "../test-utils";
import { email } from "./email";
import { hostname } from "./hostname";
import { internationalEmail } from "./international-email";
import { url } from "./url";

describe("internationalEmail", () => {
  it("should keep the local part as written and return the domain as the parser writes it", () => {
    expect(valueOf(internationalEmail()("Me.Name+tag@Example.COM"))).toBe("Me.Name+tag@example.com");
  });

  it("should accept subdomains and internationalized top-level domains in punycode", () => {
    expect(accepts(internationalEmail(), "a@mail.example.co.uk", "a@example.xn--p1ai")).toEqual([true, true]);
  });

  it("should accept an internationalized domain and return it in the ASCII form mail is delivered to", () => {
    expect(valueOf(internationalEmail()("ada@münchen.de"))).toBe("ada@xn--mnchen-3ya.de");
    expect(accepts(internationalEmail(), "ada@例え.jp", "ada@bücher.example.co.uk", "ada@xn--mnchen-3ya.de")).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("should accept a domain with a joiner where IDNA allows one, as url reads it, and reject one between letters", () => {
    // A zero-width non-joiner after a Persian letter and after a Devanagari virama, and a zero-width
    // joiner after a Sinhala virama, as these scripts write them (RFC 5892 CONTEXTJ).
    for (const name of ["می\u200Cخواهم.com", "क्\u200Cष.com", "ශ්\u200Dරී.lk"]) {
      const host = new URL(valueOf(url()(`http://${name}/`))).hostname;
      expect(valueOf(internationalEmail()(`ada@${name}`))).toBe(`ada@${host}`);
    }
    expect(accepts(internationalEmail(), "ada@a\u200Cb.com", "ada@a\u200Db.com", "ada@xn--ab-j1t.com")).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("should reject a domain the parser writes as a label it cannot read again", () => {
    expect(internationalEmail()("a@éxn--.com").ok).toBe(false);
  });

  it("should reject a punycode label that does not decode, in any position", () => {
    const invalid = ["a@example.xn--zz", "a@xn--zz.com", "a@XN--ZZ.example.com", "a@a.xn--a"];
    expect(accepts(internationalEmail(), ...invalid)).toEqual(invalid.map(() => false));
    expect(accepts(internationalEmail(), "a@a.xn--ls8h", "a@XN--MNCHEN-3YA.de")).toEqual([true, true]);
    const local = internationalEmail({ domain: hostname() });
    expect(accepts(local, "a@xn--zz", "a@xn--mnchen-3ya")).toEqual([false, true]);
  });

  it("should return the domain the parser reads when the text spells it another way, so one address has one spelling", () => {
    expect(valueOf(internationalEmail()("ada@\uff45xample.com"))).toBe("ada@example.com");
    expect(valueOf(internationalEmail()("ada@mu\u0308nchen.de"))).toBe("ada@xn--mnchen-3ya.de");
    expect(valueOf(internationalEmail()("ada@\ufb01sh.com"))).toBe("ada@fish.com");
    expect(valueOf(internationalEmail()("ada@exa\ufe0fmple.com"))).toBe("ada@example.com");
  });

  it("should read the full stops IDNA maps to a dot as dots, as url does", () => {
    for (const stop of ["\u3002", "\uff0e", "\uff61"]) {
      expect(valueOf(internationalEmail()(`ada@example${stop}com`))).toBe("ada@example.com");
      expect(valueOf(url()(`https://example${stop}com/`))).toBe("https://example.com/");
    }
  });

  it("should measure the address as it is delivered, where an internationalized host is longer", () => {
    const label = Array.from({ length: 26 }, (_, index) => String.fromCodePoint(0x4e00 + index * 7)).join("");
    const host = `${label}.${label}.${label}.${label}.com`;
    const address = `${"a".repeat(64)}@${host}`;
    expect(address.length).toBeLessThan(254);
    expect(internationalEmail()(address).ok).toBe(false);
    expect(internationalEmail()(`a@${host}`).ok).toBe(true);
  });

  it("should reject a domain written with more than 759 characters, and read a shorter one the parser shortens", () => {
    // A variation selector, which the parser drops from a host, so the domain read is `example.com`.
    const padded = (marks: number): string => `e${"\ufe0f".repeat(marks)}xample.com`;
    expect(padded(748)).toHaveLength(759);
    expect(valueOf(internationalEmail()(`a@${padded(748)}`))).toBe("a@example.com");
    expect(internationalEmail()(`a@${padded(749)}`).ok).toBe(false);
    expect(internationalEmail({ domain: hostname() })(`a@${padded(749)}`).ok).toBe(false);
    expect(accepts(url({ protocols: ["mailto"] }), `mailto:a@${padded(748)}`, `mailto:a@${padded(749)}`)).toEqual([
      true,
      false,
    ]);
    // Letters written with their accents apart are longer than the 253 characters of the host they spell.
    const decomposed = `${Array.from({ length: 5 }, () => "é".repeat(30)).join(".")}.com`;
    expect(decomposed.length).toBeGreaterThan(253);
    expect(internationalEmail()(`a@${decomposed}`).ok).toBe(true);
  });

  it("should reject an internationalized host that is not a public domain name or not a host at all", () => {
    expect(
      accepts(
        internationalEmail(),
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

  it("should accept the addresses with an ASCII domain that email accepts, with the same value", () => {
    const addresses = [
      "ada@example.com",
      "Ada.Lovelace+tag@Example.COM",
      "a@mail.example.co.uk",
      "a_b-c@sub-domain.example.net",
      "a!#$%&'*+/=?^_`{|}~-@example.com",
    ];
    for (const address of addresses) {
      expect(valueOf(internationalEmail()(address))).toBe(valueOf(email()(address)));
    }
  });

  it("should reject what email rejects of an address with an ASCII domain", () => {
    const rejected = [
      "plain",
      "@example.com",
      "a@",
      "a@@example.com",
      "a b@example.com",
      "a..b@example.com",
      "ü@example.com",
      `${"a".repeat(65)}@example.com`,
      `a@${"b".repeat(250)}.com`,
      "a@localhost",
      "a@intranet",
      "a@foo.localhost",
      "a@Mail.INTERNAL",
      "a@x.test",
      "a@127.0.0.1",
      "a@0x7f000001",
      "a@[::1]",
      "a@example.com.",
    ];
    expect(accepts(email(), ...rejected)).toEqual(rejected.map(() => false));
    expect(accepts(internationalEmail(), ...rejected)).toEqual(rejected.map(() => false));
  });

  it("should take the options email takes", () => {
    expect(internationalEmail()("a+b@münchen.de").ok).toBe(true);
    expect(internationalEmail({ allowPlus: false })("a+b@münchen.de").ok).toBe(false);
    expect(valueOf(internationalEmail({ domain: hostname() })("ada@localhost"))).toBe("ada@localhost");
    expect(issuesOf(internationalEmail({ message: "Not an address" })("nope"))[0]?.message).toBe("Not an address");
  });

  it("should describe itself as email does, and say that its domain may be internationalized", () => {
    expect(describeSchema(internationalEmail())).toMatchObject({
      kind: "format",
      format: "email",
      international: true,
    });
    expect(describeSchema(email())).not.toHaveProperty("international");
  });

  it("should reject non-strings as invalid_type and bad strings as invalid_format, as email does", () => {
    expect(codesOf(internationalEmail()(42))).toEqual(["invalid_type"]);
    expect(issuesOf(internationalEmail()("ada@münchen"))).toEqual([
      { code: "invalid_format", path: [], params: { format: "email" } },
    ]);
    expect(issuesOf(internationalEmail()("nope"))).toEqual(issuesOf(email()("nope")));
  });
});
