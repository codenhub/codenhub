import { describe, expect, it } from "vitest";

import { accepts, codesOf, issuesOf, valueOf } from "../test-utils";
import { url } from "./url";

describe("url", () => {
  it("should accept absolute http and https URLs with public hosts, unchanged", () => {
    expect(valueOf(url()("https://Example.com/a?b=1#c"))).toBe("https://Example.com/a?b=1#c");
    expect(url()("http://sub.example.co.uk").ok).toBe(true);
  });

  it("should reject input that is not an absolute URL, without guessing a scheme", () => {
    expect(accepts(url(), "example.com", "//example.com", "not a url", "")).toEqual([false, false, false, false]);
  });

  it("should reject text the URL parser would have to clean up, since the value is returned as it came", () => {
    expect(
      accepts(
        url(),
        " https://example.com",
        "https://example.com ",
        "https://exa\nmple.com",
        "https://example.com/a\r\nLocation: https://evil.com",
        "https://example.com/\tx",
        "https://example.com/a b",
        "https:\\\\example.com\\path",
        "https://example.com/\u0000",
      ),
    ).toEqual(Array(8).fill(false));
    expect(url({ allowLocal: true })(" http://localhost").ok).toBe(false);
  });

  it("should reject a host written without both slashes, which resolves as a path against a same-scheme base", () => {
    expect(accepts(url(), "https:example.com", "https:/example.com", "HTTP:example.com/a")).toEqual([
      false,
      false,
      false,
    ]);
    expect(accepts(url(), "https://example.com", "HTTPS://example.com/a")).toEqual([true, true]);
    expect(accepts(url({ protocols: ["ftp"] }), "ftp:example.com", "ftp://example.com")).toEqual([false, true]);
  });

  it("should reject other protocols, embedded credentials and non-public hosts", () => {
    expect(
      accepts(
        url(),
        "ftp://example.com",
        "javascript:alert(1)",
        "https://user:pw@example.com",
        "https://user@example.com",
        "http://localhost:3000",
        "http://127.0.0.1",
        "http://[::1]",
        "http://intranet",
      ),
    ).toEqual(Array(8).fill(false));
  });

  it("should reject special-use domain names, which never name a public host", () => {
    const reserved = [
      "http://admin.localhost",
      "http://db.internal",
      "http://printer.local",
      "http://site.test",
      "http://site.example",
      "http://site.invalid",
      "http://site.alt",
      "http://site.onion",
      "http://router.home.arpa",
    ];
    expect(accepts(url(), ...reserved)).toEqual(Array(reserved.length).fill(false));
    expect(accepts(url({ allowLocal: true }), ...reserved)).toEqual(Array(reserved.length).fill(true));
  });

  it("should still accept public names that only contain a reserved word", () => {
    expect(accepts(url(), "https://localhost.com", "https://test.example.com", "https://arpa.net")).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("should accept local hosts only with allowLocal", () => {
    const local = url({ allowLocal: true });
    expect(accepts(local, "http://localhost:3000", "http://127.0.0.1", "http://[::1]:8080", "http://intranet")).toEqual(
      [true, true, true, true],
    );
  });

  it("should still refuse credentials with allowLocal", () => {
    expect(url({ allowLocal: true })("http://user:pw@localhost").ok).toBe(false);
  });

  it("should accept other protocols when listed, and stop accepting http and https", () => {
    const ftp = url({ protocols: ["ftp"] });
    expect(accepts(ftp, "ftp://example.com", "https://example.com")).toEqual([true, false]);
  });

  it("should match protocols in any letter case", () => {
    expect(accepts(url({ protocols: ["HTTPS", "Ftp"] }), "https://example.com", "ftp://example.com")).toEqual([
      true,
      true,
    ]);
  });

  it("should refuse a protocol that is not a scheme name, which would otherwise match nothing", () => {
    for (const protocol of ["https:", "https://", "", "1http", "ht tp"]) {
      expect(() => url({ protocols: [protocol] })).toThrow(TypeError);
    }
  });

  it("should accept any IP address with allowLocal, public or not, and does not check ranges", () => {
    expect(accepts(url(), "http://8.8.8.8/", "http://169.254.169.254/")).toEqual([false, false]);
    expect(accepts(url({ allowLocal: true }), "http://8.8.8.8/", "http://169.254.169.254/", "http://[::1]/")).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("should copy the protocol list, so changing it later has no effect", () => {
    const protocols = ["https"];
    const validator = url({ protocols });
    protocols.push("ftp");
    expect(validator("ftp://example.com").ok).toBe(false);
  });

  it("should report invalid_type for a non-string and invalid_format for a bad URL", () => {
    expect(codesOf(url()(42))).toEqual(["invalid_type"]);
    expect(issuesOf(url()("nope"))).toEqual([{ code: "invalid_format", path: [], params: { format: "url" } }]);
  });

  it("should not echo the input", () => {
    expect(JSON.stringify(issuesOf(url()("https://user:hunter2@example.com")))).not.toContain("hunter2");
  });
});

describe("url without a host", () => {
  const mailto = url({ protocols: ["mailto"] });
  const tel = url({ protocols: ["tel"] });
  const urn = url({ protocols: ["urn"] });

  it("should accept mailto addresses that email() accepts, in the path and in to, cc and bcc", () => {
    const valid = [
      "mailto:ada@example.com",
      "MAILTO:ada@example.com",
      "mailto:ada@example.com,bob@example.org?subject=Hi%20there",
      "mailto:ada%2Bnews@example.com",
      "mailto:ada@example.com?cc=bob@example.org&bcc=eve@example.net",
    ];
    expect(accepts(mailto, ...valid)).toEqual(valid.map(() => true));
  });

  it("should reject a mailto with no address, a bad address, bad encoding or a local host", () => {
    const invalid = [
      "mailto:",
      "mailto:?subject=hi",
      "mailto:not-an-address",
      "mailto:ada@localhost",
      "mailto:ada@db.internal",
      "mailto:ada@example.com,",
      "mailto:ada@example.com?cc=eve@localhost",
      "mailto:ada@example.com?to=nope",
      "mailto:ada%E0%A4%A@example.com",
    ];
    expect(accepts(mailto, ...invalid)).toEqual(invalid.map(() => false));
  });

  it("should check a mailto with any number of recipients without throwing", () => {
    const recipients = Array.from({ length: 200_000 }, () => "ada@example.com").join(",");
    expect(mailto(`mailto:?to=${recipients}`).ok).toBe(true);
    expect(mailto(`mailto:?to=${recipients},nope`).ok).toBe(false);
  });

  it("should accept a local mailto host only with allowLocal", () => {
    const local = url({ protocols: ["mailto"], allowLocal: true });
    expect(accepts(local, "mailto:ada@localhost", "mailto:ada@intranet", "mailto:nope")).toEqual([true, true, false]);
  });

  it("should accept global tel numbers with separators and parameters, and nothing else", () => {
    expect(accepts(tel, "tel:+1-201-555-0123", "tel:+44(0)20.7946.0958", "tel:+12015550123;ext=1234")).toEqual([
      true,
      true,
      true,
    ]);
    const invalid = ["tel:", "tel:+", "tel:555-0123", "tel:+abc", "tel:+1-", "tel:1234;phone-context=example.com"];
    expect(accepts(tel, ...invalid)).toEqual(invalid.map(() => false));
  });

  it("should accept urns with a namespace and a specific string, as RFC 8141 writes them", () => {
    const valid = ["urn:isbn:0451450523", "urn:ietf:rfc:2648", "URN:example:a%20b", "urn:example:x?+r?=q#f"];
    expect(accepts(urn, ...valid)).toEqual(valid.map(() => true));
    const invalid = ["urn:", "urn:isbn", "urn:isbn:", "urn:x:abc", "urn:is_bn:1", "urn:isbn:%zz", "urn:-isbn:1"];
    expect(accepts(urn, ...invalid)).toEqual(invalid.map(() => false));
  });

  it("should reject every other scheme without a host, even with allowLocal, rather than check nothing", () => {
    const anything = url({ protocols: ["data", "file", "javascript"], allowLocal: true });
    expect(accepts(anything, "data:text/plain,hi", "file:///etc/passwd", "javascript:alert(1)")).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("should check long tel and urn text in linear time", () => {
    const start = performance.now();
    expect(tel(`tel:+${"1-".repeat(50_000)}x`).ok).toBe(false);
    expect(urn(`urn:isbn:${"a".repeat(100_000)}%z`).ok).toBe(false);
    expect(performance.now() - start).toBeLessThan(250);
  });
});
