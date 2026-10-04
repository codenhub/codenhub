import { describe, expect, it } from "vitest";

import { oneOf } from "../primitives/one-of";
import { unknown } from "../primitives/unknown";
import { accepts, codesOf, issuesOf, valueOf } from "../test-utils";
import { url } from "./url";

describe("url", () => {
  it("should accept absolute http and https URLs with public hosts, as the URL parser writes them", () => {
    expect(valueOf(url()("https://Example.com/a?b=1#c"))).toBe("https://example.com/a?b=1#c");
    expect(valueOf(url()("http://sub.example.co.uk"))).toBe("http://sub.example.co.uk/");
    expect(valueOf(url()("https://example.com:443/"))).toBe("https://example.com/");
  });

  it("should reject input that is not an absolute URL, without guessing a scheme", () => {
    expect(accepts(url(), "example.com", "//example.com", "not a url", "")).toEqual([false, false, false, false]);
  });

  it("should reject text holding whitespace or control characters, which a written URL never contains", () => {
    expect(
      accepts(
        url(),
        " https://example.com",
        "https://example.com ",
        "https://exa\nmple.com",
        "https://example.com/a\r\nLocation: https://evil.com",
        "https://example.com/\tx",
        "https://example.com/a b",
        "https://example.com/\u0000",
        "https://example.com/\u007f",
      ),
    ).toEqual(Array(8).fill(false));
    expect(url({ host: unknown() })(" http://localhost").ok).toBe(false);
  });

  it("should return the path the parser reads, so dot segments cannot hide where it leads", () => {
    expect(valueOf(url()("https://example.com/public/../admin"))).toBe("https://example.com/admin");
    expect(valueOf(url()("https://example.com/public/%2e%2e/admin"))).toBe("https://example.com/admin");
    expect(valueOf(url()("https://example.com/a/./b"))).toBe("https://example.com/a/b");
  });

  it("should return characters that are unsafe in markup percent-encoded, as the parser writes them", () => {
    expect(valueOf(url()('https://example.com/a"b<c>'))).toBe("https://example.com/a%22b%3Cc%3E");
    expect(valueOf(url()("https://example.com/ü"))).toBe("https://example.com/%C3%BC");
  });

  it("should return the host the parser reads when the text spells it another way", () => {
    expect(valueOf(url()("https://exa­mple.com/"))).toBe("https://example.com/");
    expect(valueOf(url()("https://exa️mple.com/"))).toBe("https://example.com/");
    expect(valueOf(url()("https://evil。com/"))).toBe("https://evil.com/");
    expect(valueOf(url()("https://ｅxample.com"))).toBe("https://example.com/");
    expect(valueOf(url()("https://münchen.de/"))).toBe("https://xn--mnchen-3ya.de/");
    expect(valueOf(url()("https://münchen.de/"))).toBe("https://xn--mnchen-3ya.de/");
    expect(valueOf(url()("https://%65xample.com"))).toBe("https://example.com/");
  });

  it("should return the authority the parser reads when slashes or an empty userinfo are off", () => {
    expect(valueOf(url()("http:///example.com"))).toBe("http://example.com/");
    expect(valueOf(url()("https:example.com"))).toBe("https://example.com/");
    expect(valueOf(url()("https:\\\\example.com\\path"))).toBe("https://example.com/path");
    expect(valueOf(url()("https://@example.com"))).toBe("https://example.com/");
    expect(valueOf(url({ protocols: ["ftp"] })("ftp:example.com"))).toBe("ftp://example.com/");
  });

  it("should reject a host longer than the 253 characters a domain name can have", () => {
    const labels = (count: number): string => Array.from({ length: count }, () => "a".repeat(61)).join(".");
    const longest = `${labels(4)}.abcde`;
    expect(longest).toHaveLength(253);
    expect(url()(`https://${longest}/`).ok).toBe(true);
    expect(url()(`https://${longest}f/`).ok).toBe(false);
    expect(url({ host: unknown() })(`https://${labels(20)}/`).ok).toBe(false);
  });

  it("should reject an absolute host ending in a dot, whatever the host validator or scheme", () => {
    expect(accepts(url(), "https://Example.com./a", "https://localhost./", "https://example.com../")).toEqual([
      false,
      false,
      false,
    ]);
    expect(
      accepts(url({ host: unknown(), protocols: ["http", "ssh"] }), "http://localhost./", "ssh://db.internal./"),
    ).toEqual([false, false]);
    // The parser drops the final dot of an IPv4 address itself, so its value has one spelling already.
    expect(valueOf(url({ host: unknown() })("http://127.0.0.1./"))).toBe("http://127.0.0.1/");
  });

  it("should reject a punycode host that does not decode", () => {
    expect(accepts(url(), "https://xn--zz.com", "https://example.xn--zz")).toEqual([false, false]);
  });

  it("should reject a host the parser writes as a label it cannot read again, whatever the host validator", () => {
    expect(accepts(url(), "http://éxn--.com", "http://xn--xn---9oa.com")).toEqual([false, false]);
    expect(accepts(url({ host: unknown() }), "http://éxn--.com", "http://äxn--")).toEqual([false, false]);
  });

  it("should give a host validator only a host every runtime reads alike, of letters, digits, . - and _ or an IP address", () => {
    // Chromium and Firefox read or refuse each of these differently from Node.js.
    const anyHost = url({ protocols: ["http", "ssh"], host: unknown() });
    expect(
      accepts(
        anyHost,
        "http://a*b.com/",
        'http://a"b.com/',
        "http://a%2a.com/",
        "http://a%20.com/",
        "http://[::01.2.3.4]/",
        "http://0x/",
        "http://1.0X/",
        // A Hangul filler, which IDNA drops, leaves an empty label: Node.js reads `.com`, and WebKit refuses it.
        `http://${String.fromCodePoint(0x31_64)}.com/`,
        "http://a..b/",
      ),
    ).toEqual([false, false, false, false, false, false, false, false, false]);
    expect(
      ["http://a_b.example/", "http://ex%61mple.com/", "http://0x.com/", "http://0x7f.1/", "http://[::1.2.3.4]/"].map(
        (text) => valueOf(anyHost(text)),
      ),
    ).toEqual([
      "http://a_b.example/",
      "http://example.com/",
      "http://0x.com/",
      "http://127.0.0.1/",
      "http://[::102:304]/",
    ]);
    // A scheme the parser has no rules for keeps its host as written, and every runtime reads it so.
    expect(valueOf(anyHost("ssh://a*b.com/"))).toBe("ssh://a*b.com/");
  });

  it("should hold the internationalized labels of a host to the browsers' rules whatever the host validator", () => {
    // Node.js 24 reads the first two, which break the bidi rule, and refuses the last two, which do not
    // decode, where Chromium and WebKit read them.
    expect(
      accepts(url({ host: unknown() }), "http://٠.com", "http://1.ب", "http://xn--zz.com", "http://xn--a.com"),
    ).toEqual([false, false, false, false]);
    expect(valueOf(url({ host: unknown() })("http://münchen.de"))).toBe("http://xn--mnchen-3ya.de/");
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
      "http://1.0.0.127.in-addr.arpa",
      "http://example.テスト",
      "http://db.corp",
      "http://nas.home",
      "http://smtp.mail",
      "http://localhost.localdomain",
    ];
    expect(accepts(url(), ...reserved)).toEqual(Array(reserved.length).fill(false));
    expect(accepts(url({ host: unknown() }), ...reserved)).toEqual(Array(reserved.length).fill(true));
  });

  it("should still accept public names that only contain a reserved word", () => {
    expect(
      accepts(
        url(),
        "https://localhost.com",
        "https://test.example.com",
        "https://arpa.net",
        "https://mail.example.com",
        "https://corp.example.com",
        "https://home.example.com",
        "https://localdomain.org",
      ),
    ).toEqual(Array(7).fill(true));
  });

  it("should accept local hosts only with a host validator that does", () => {
    const local = url({ host: unknown() });
    expect(accepts(local, "http://localhost:3000", "http://127.0.0.1", "http://[::1]:8080", "http://intranet")).toEqual(
      [true, true, true, true],
    );
  });

  it("should reject port 0, which nothing can connect to, unless a port validator accepts it", () => {
    expect(accepts(url(), "https://example.com:0/", "https://example.com:00/", "https://example.com:1/")).toEqual([
      false,
      false,
      true,
    ]);
    expect(issuesOf(url()("https://example.com:0/"))).toEqual([
      { code: "invalid_format", path: [], params: { format: "url" } },
    ]);
    expect(valueOf(url({ port: unknown() })("https://example.com:0/"))).toBe("https://example.com:0/");
  });

  it("should still refuse credentials with a host validator", () => {
    expect(url({ host: unknown() })("http://user:pw@localhost").ok).toBe(false);
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

  it("should refuse the schemes that run script, since no URL of theirs is safe to accept", () => {
    for (const protocol of ["javascript", "JavaScript", "vbscript", "data"]) {
      expect(() => url({ protocols: ["https", protocol] })).toThrow(
        new TypeError(`${protocol.toLowerCase()} URLs can run script and cannot be accepted`),
      );
    }
  });

  it("should accept a listed scheme with a host, such as file or ftp", () => {
    expect(accepts(url({ protocols: ["file", "ftp"] }), "file://example.com/share", "ftp://example.com/a")).toEqual([
      true,
      true,
    ]);
  });

  it("should return the host of a scheme the parser leaves as written in lowercase, so one URL is one value", () => {
    const ssh = url({ protocols: ["ssh", "postgres"] });
    expect(valueOf(ssh("ssh://EXAMPLE.com/repo"))).toBe("ssh://example.com/repo");
    expect(valueOf(ssh("postgres://Db.Example.COM:5432/app?x=1"))).toBe("postgres://db.example.com:5432/app?x=1");
  });

  it("should give a host validator that lowercase host, and keep its escapes uppercase as RFC 3986 writes them", () => {
    expect(accepts(url({ protocols: ["ssh"], host: oneOf(["example.com"]) }), "ssh://EXAMPLE.COM/x")).toEqual([true]);
    expect(valueOf(url({ protocols: ["git"], host: unknown() })("git://Ex%c3%A4mple.COM"))).toBe(
      "git://ex%C3%A4mple.com",
    );
  });

  it("should read a host that some URL parsers cannot be written to again without ending the process", () => {
    // Node.js 24.14.1, and 24.16 to 24.19 (ada 3.4.4), parse a non-ASCII letter before `xn--` into a URL
    // whose every setter aborts the process, so a validator that wrote the host back would let one request
    // end a server. The host is read before it is checked, so these cases reach any setter that comes back.
    expect(accepts(url(), "http://äxn--", "ssh://äxn--")).toEqual([false, false]);
    expect(valueOf(url({ protocols: ["ssh"], host: unknown() })("ssh://ÄXN--"))).toBe("ssh://%C3%84xn--");
  });

  it("should give any IP address to a host validator, public or not, checking no ranges itself", () => {
    expect(accepts(url(), "http://8.8.8.8/", "http://169.254.169.254/")).toEqual([false, false]);
    expect(accepts(url({ host: unknown() }), "http://8.8.8.8/", "http://169.254.169.254/", "http://[::1]/")).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("should return an IPv4 host in the one form the parser reads it, however it was written", () => {
    const local = url({ host: unknown() });
    const spellings = ["http://0x7f.1", "http://0X7F.0.0.1", "http://127.1", "http://0177.0.0.1", "http://2130706433"];
    for (const spelling of spellings) {
      expect(valueOf(local(spelling))).toBe("http://127.0.0.1/");
    }
    expect(accepts(url(), ...spellings)).toEqual(spellings.map(() => false));
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

  it("should accept only the fields RFC 6068 gives a message: to, cc, bcc, subject and body", () => {
    expect(accepts(mailto, "mailto:ada@example.com?Subject=Hi&BODY=Line%0D%0Aline")).toEqual([true]);
    const invalid = [
      "mailto:ada@example.com?from=boss@example.com",
      "mailto:ada@example.com?reply-to=eve@example.net",
      "mailto:ada@example.com?subject=Hi&x-mailer=spoof",
      "mailto:ada@example.com?",
      "mailto:ada@example.com?subject",
      "mailto:ada@example.com?subject=Hi&&body=x",
    ];
    expect(accepts(mailto, ...invalid)).toEqual(invalid.map(() => false));
  });

  it("should reject a line break in the subject, which only the body may hold", () => {
    expect(
      accepts(
        mailto,
        "mailto:ada@example.com?subject=Hi%0D%0ABcc:%20eve@example.net",
        "mailto:ada@example.com?subject=Hi%0aBcc:eve@example.net",
        "mailto:ada@example.com?SUBJECT=Hi%0d",
        "mailto:ada@example.com?subject=100%25%20done&body=Line%0D%0Aline",
      ),
    ).toEqual([false, false, false, true]);
  });

  it("should reject a repeated subject or body, and accept repeated recipient fields", () => {
    expect(
      accepts(
        mailto,
        "mailto:ada@example.com?subject=a&subject=b",
        "mailto:ada@example.com?Subject=a&SUBJECT=b",
        "mailto:ada@example.com?body=a&body=b",
        "mailto:ada@example.com?to=bob@example.org&to=eve@example.net&cc=a@example.com&cc=b@example.com",
      ),
    ).toEqual([false, false, false, true]);
  });

  it("should return each mailto recipient as email() does, so a later check on the value sees where mail goes", () => {
    expect(valueOf(mailto("mailto:ada@EXAMPLE.com"))).toBe("mailto:ada@example.com");
    expect(valueOf(mailto("mailto:ada@exa%6dple.com"))).toBe("mailto:ada@example.com");
    expect(valueOf(mailto("mailto:Ada@München.de"))).toBe("mailto:Ada@xn--mnchen-3ya.de");
    expect(valueOf(mailto("mailto:ada%2Bnews@example.com"))).toBe("mailto:ada+news@example.com");
    expect(valueOf(mailto("mailto:?To=Bob@EXAMPLE.org&Subject=Hi%20there"))).toBe(
      "mailto:?to=Bob@example.org&subject=Hi%20there",
    );
  });

  it("should keep the mailto characters that would end an address percent-encoded in its local part", () => {
    expect(valueOf(mailto("mailto:a%3fb%26c%23d%25e@example.com"))).toBe("mailto:a%3Fb%26c%23d%25e@example.com");
    expect(valueOf(mailto("mailto:ada@example.com?cc=a%3Db@example.org"))).toBe(
      "mailto:ada@example.com?cc=a%3Db@example.org",
    );
  });

  it("should apply the rules of mailto, tel and urn even when the URL is written with a host", () => {
    const all = url({ protocols: ["mailto", "tel", "urn"] });
    const invalid = [
      "mailto://evil.example.org",
      "mailto://example.com?to=ada@example.com",
      "tel://example.com",
      "urn://example.com",
    ];
    expect(accepts(all, ...invalid)).toEqual(invalid.map(() => false));
    // `/` is allowed in a local part, so this names one recipient, and the value says so.
    expect(valueOf(all("mailto://example.com/ada@example.com"))).toBe("mailto:%2F%2Fexample.com%2Fada@example.com");
  });

  it("should accept subject and body text as RFC 6068 writes it, and / and ? as a URL query allows them", () => {
    const valid = [
      "mailto:ada@example.com?subject=Hi%20there&body=Line%0D%0Aline",
      "mailto:ada@example.com?subject=(re):a,b;c@d!$'*+-._~",
      "mailto:ada@example.com?subject=",
      "mailto:ada@example.com?subject=Why?&body=https://example.com/a?b",
    ];
    expect(accepts(mailto, ...valid)).toEqual(valid.map(() => true));
    const invalid = [
      "mailto:ada@example.com?subject=%zz",
      "mailto:ada@example.com?body=a%2",
      "mailto:ada@example.com?body=a`b",
      "mailto:ada@example.com?subject=a{b}|c^d",
      "mailto:ada@example.com?body=a[b]",
      "mailto:ada@example.com?body=a=b",
    ];
    expect(accepts(mailto, ...invalid)).toEqual(invalid.map(() => false));
  });

  // Large on purpose, so a loaded machine may take a while over it; it checks what happens, not how fast.
  it("should check a mailto with any number of recipients without throwing", { timeout: 30_000 }, () => {
    const recipients = Array.from({ length: 200_000 }, () => "ada@example.com").join(",");
    expect(mailto(`mailto:?to=${recipients}`).ok).toBe(true);
    expect(mailto(`mailto:?to=${recipients},nope`).ok).toBe(false);
  });

  it("should require a public domain for a mailto recipient, since host validates a URL's host and a mailto has none", () => {
    const local = url({ protocols: ["mailto"], host: unknown() });
    expect(accepts(local, "mailto:ada@localhost", "mailto:ada@intranet", "mailto:ada@example.com")).toEqual([
      false,
      false,
      true,
    ]);
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

  it("should accept only the characters RFC 3966 allows in a tel parameter value", () => {
    expect(accepts(tel, "tel:+1;x=a-_.!~*'()[]/:&+$", "tel:+1;isub=a%20b", "tel:+1;flag")).toEqual([true, true, true]);
    const invalid = [
      'tel:+1;x="><img/src=x/onerror=alert(1)>',
      "tel:+1;x=<",
      "tel:+1;x=%zz",
      "tel:+1;x=",
      "tel:+1;x=a,b",
    ];
    expect(accepts(tel, ...invalid)).toEqual(invalid.map(() => false));
  });

  it("should accept urns with a namespace and a specific string, as RFC 8141 writes them", () => {
    const valid = ["urn:isbn:0451450523", "urn:ietf:rfc:2648", "URN:example:a%20b", "urn:example:x?+r?=q#f"];
    expect(accepts(urn, ...valid)).toEqual(valid.map(() => true));
    const invalid = ["urn:", "urn:isbn", "urn:isbn:", "urn:x:abc", "urn:is_bn:1", "urn:isbn:%zz", "urn:-isbn:1"];
    expect(accepts(urn, ...invalid)).toEqual(invalid.map(() => false));
  });

  it("should reject every other scheme without a host, even with a host validator, rather than check nothing", () => {
    const anything = url({ protocols: ["file", "about", "blob"], host: unknown() });
    expect(accepts(anything, "file:///etc/passwd", "about:blank", "blob:https://example.com/a")).toEqual([
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
