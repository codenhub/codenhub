import { describe, expect, it } from "vitest";

import { accepts, issuesOf, valueOf } from "../test-utils";
import { base64 } from "./base64";
import { cidr } from "./cidr";
import { creditCard } from "./credit-card";
import { domain } from "./domain";
import { duration } from "./duration";
import { email } from "./email";
import { ip } from "./ip";
import { jwt } from "./jwt";
import { mac } from "./mac";
import { phone } from "./phone";
import { port } from "./port";
import { semver } from "./semver";
import { slug } from "./slug";
import { time } from "./time";
import { url } from "./url";
import { uuid } from "./uuid";

const formatOf = (result: Parameters<typeof issuesOf>[0]): unknown => issuesOf(result)[0]?.params?.format;

describe("slug", () => {
  it("should accept lowercase words joined by single hyphens", () => {
    expect(accepts(slug(), "hello", "hello-world-2", "a1")).toEqual([true, true, true]);
    expect(accepts(slug(), "", "Hello", "hello--world", "-hello", "hello-", "héllo", "a_b")).toEqual(
      Array(7).fill(false),
    );
    expect(formatOf(slug()("A"))).toBe("slug");
  });
});

describe("semver", () => {
  it("should accept versions as Semantic Versioning 2.0.0 writes them", () => {
    expect(
      accepts(semver(), "0.0.0", "1.2.3", "1.0.0-alpha.1", "1.0.0-0a", "1.0.0+build.5", "1.0.0-rc.1+sha.1f2"),
    ).toEqual(Array(6).fill(true));
  });

  it("should reject leading zeros, a leading v and missing parts", () => {
    expect(accepts(semver(), "01.0.0", "1.0.0-01", "v1.0.0", "1.0", "1.0.0-", "1.0.0+", "1.0.0-a..b")).toEqual(
      Array(7).fill(false),
    );
  });

  it("should answer a long run of digits at once, since matching is linear", () => {
    const started = performance.now();
    expect(semver()(`1.0.0-${"1".repeat(50_000)}!`).ok).toBe(false);
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe("duration", () => {
  it("should accept ISO 8601 durations with at least one component", () => {
    expect(accepts(duration(), "P1Y", "P1Y2M3W4D", "PT1H30M", "PT0.5S", "P1DT12H")).toEqual(Array(5).fill(true));
    expect(accepts(duration(), "P", "PT", "P1H", "1Y", "PT1.5H", "P-1D", "p1d")).toEqual(Array(7).fill(false));
  });
});

describe("time", () => {
  it("should accept times of day with optional seconds and fraction", () => {
    expect(accepts(time(), "00:00", "23:59", "09:15:30", "09:15:30.250")).toEqual([true, true, true, true]);
    expect(accepts(time(), "24:00", "9:15", "09:60", "09:15:61", "09:15Z", "09:15:30.")).toEqual(Array(6).fill(false));
  });

  it("should require seconds and exactly that many fraction digits with a precision", () => {
    expect(accepts(time({ precision: 0 }), "09:15:30", "09:15", "09:15:30.1")).toEqual([true, false, false]);
    expect(accepts(time({ precision: 3 }), "09:15:30.250", "09:15:30.25")).toEqual([true, false]);
    expect(() => time({ precision: 10 })).toThrow(RangeError);
  });
});

describe("mac", () => {
  it("should accept colon or hyphen separated pairs and return them lowercase with colons", () => {
    expect(valueOf(mac()("00-1A-2B-3C-4D-5E"))).toBe("00:1a:2b:3c:4d:5e");
    expect(valueOf(mac()("00:1a:2b:3c:4d:5e"))).toBe("00:1a:2b:3c:4d:5e");
    expect(accepts(mac(), "00:1a-2b:3c:4d:5e", "001a2b3c4d5e", "00:1a:2b:3c:4d", "00:1a:2b:3c:4d:5g")).toEqual(
      Array(4).fill(false),
    );
  });
});

describe("creditCard", () => {
  it("should accept numbers whose Luhn checksum holds, grouped or not, and return the digits", () => {
    expect(valueOf(creditCard()("4242 4242 4242 4242"))).toBe("4242424242424242");
    expect(valueOf(creditCard()("4242-4242-4242-4242"))).toBe("4242424242424242");
    expect(valueOf(creditCard()("378282246310005"))).toBe("378282246310005");
  });

  it("should reject a failed checksum, mixed or doubled separators, and the wrong number of digits", () => {
    expect(
      accepts(
        creditCard(),
        "4242424242424241",
        "4242 4242-4242 4242",
        "4242  4242 4242 4242",
        "42424242424",
        "4".repeat(20),
      ),
    ).toEqual(Array(5).fill(false));
  });

  it("should never put the number into an issue", () => {
    const secret = "4242 4242 4242 4241";
    expect(JSON.stringify(issuesOf(creditCard()(secret)))).not.toContain("4242");
  });
});

describe("phone", () => {
  it("should accept international numbers with the separators people type, and return E.164", () => {
    expect(valueOf(phone()("+55 (11) 98765-4321"))).toBe("+5511987654321");
    expect(valueOf(phone()("+1.201.555.0123"))).toBe("+12015550123");
    expect(valueOf(phone()("+442079460958"))).toBe("+442079460958");
  });

  it("should reject a missing or zero country code, too few or too many digits, and stray characters", () => {
    expect(
      accepts(
        phone(),
        "(11) 98765-4321",
        "+0 11 98765",
        "+123456",
        `+1${"2".repeat(15)}`,
        "+1 201 555 01x3",
        "+1--201",
      ),
    ).toEqual(Array(6).fill(false));
  });
});

describe("jwt", () => {
  const header = "eyJhbGciOiJIUzI1NiJ9"; // {"alg":"HS256"}
  const payload = "eyJzdWIiOiIxIn0"; // {"sub":"1"}

  it("should accept three segments whose header and payload are JSON objects, the header naming alg", () => {
    expect(accepts(jwt(), `${header}.${payload}.c2ln`, `${header}.${payload}.`)).toEqual([true, true]);
  });

  it("should reject what is not a token", () => {
    const noAlg = "e30"; // {}
    const notObject = "WzFd"; // [1]
    expect(
      accepts(
        jwt(),
        "a.b",
        `${header}.${payload}`,
        `${noAlg}.${payload}.x`,
        `${header}.${notObject}.x`,
        `${header}.@@.x`,
        `${header}.${payload}.x.y`,
        `${header}.a.x`,
        `${header}.aGVsbG8.x`,
      ),
    ).toEqual(Array(8).fill(false));
  });

  it("should reject a segment that is not UTF-8, as JSON text must be", () => {
    const badUtf8 = "eyJhbGciOiL_In0"; // {"alg":"<0xff>"}
    expect(accepts(jwt(), `${badUtf8}.${payload}.x`, `${header}.${badUtf8}.x`)).toEqual([false, false]);
  });
});

describe("ip", () => {
  it("should return an IPv6 address in the canonical spelling, and an IPv4 address as written", () => {
    expect(valueOf(ip()("0:0:0:0:0:0:0:1"))).toBe("::1");
    expect(valueOf(ip()("2001:DB8:0:0:1:0:0:1"))).toBe("2001:db8::1:0:0:1");
    expect(valueOf(ip()("fe80::1%eth0"))).toBe("fe80::1%eth0");
    expect(valueOf(ip()("192.168.0.1"))).toBe("192.168.0.1");
  });
});

describe("cidr", () => {
  it("should accept an address and a prefix its family allows, in canonical spelling", () => {
    expect(valueOf(cidr()("10.0.0.0/8"))).toBe("10.0.0.0/8");
    expect(valueOf(cidr()("2001:DB8:0::/32"))).toBe("2001:db8::/32");
    expect(accepts(cidr(), "0.0.0.0/0", "192.168.0.5/24", "::/128")).toEqual([true, true, true]);
  });

  it("should reject a prefix too long for the family, leading zeros, zones and a missing prefix", () => {
    expect(accepts(cidr(), "10.0.0.0/33", "::/129", "10.0.0.0/08", "fe80::1%eth0/64", "10.0.0.0", "10.0.0.0/")).toEqual(
      Array(6).fill(false),
    );
  });

  it("should restrict the family and name it in the format", () => {
    expect(accepts(cidr({ version: "v4" }), "10.0.0.0/8", "::/0")).toEqual([true, false]);
    expect(formatOf(cidr({ version: "v6" })("10.0.0.0/8"))).toBe("cidrv6");
  });

  it("should throw for a version that is not v4 or v6", () => {
    expect(() => cidr({ version: "v5" as never })).toThrow(TypeError);
  });
});

describe("domain", () => {
  it("should accept public domain names and return them as the parser reads them", () => {
    expect(valueOf(domain()("Example.COM"))).toBe("example.com");
    expect(valueOf(domain()("münchen.de"))).toBe("xn--mnchen-3ya.de");
  });

  it("should reject hosts that are not public domain names", () => {
    expect(
      accepts(
        domain(),
        "localhost",
        "intranet",
        "printer.local",
        "db.internal",
        "example.test",
        "127.0.0.1",
        "example.com.",
      ),
    ).toEqual(Array(7).fill(false));
  });

  it("should reject every name under .arpa and the IDN test top-level domains", () => {
    const reserved = [
      "1.0.0.127.in-addr.arpa",
      "b.a.ip6.arpa",
      "router.home.arpa",
      "example.arpa",
      ...[
        "إختبار",
        "آزمایشی",
        "测试",
        "測試",
        "испытание",
        "परीक्षा",
        "δοκιμή",
        "테스트",
        "טעסט",
        "テスト",
        "பரிட்சை",
      ].map((tld) => `example.${tld}`),
      "example.xn--zckzah",
      "example.XN--ZCKZAH",
    ];
    expect(accepts(domain(), ...reserved)).toEqual(reserved.map(() => false));
    expect(accepts(email(), ...reserved.map((host) => `ada@${host}`))).toEqual(reserved.map(() => false));
    expect(accepts(domain(), "arpa.example.com", "テスト.example.com", "xn--zckzah.com")).toEqual([true, true, true]);
  });

  it("should hold its top-level label to 63 characters, as it does every other label", () => {
    expect(accepts(domain(), `example.${"a".repeat(63)}`, `example.${"a".repeat(64)}`)).toEqual([true, false]);
    expect(accepts(email(), `ada@example.${"a".repeat(64)}`)).toEqual([false]);
    expect(accepts(url(), `https://example.${"a".repeat(64)}/`)).toEqual([false]);
  });
});

describe("port", () => {
  it("should accept whole numbers from 1 to 65535", () => {
    expect(accepts(port(), 1, 80, 65_535)).toEqual([true, true, true]);
  });

  it("should reject zero, larger numbers, fractions and text", () => {
    expect(issuesOf(port()(0))).toEqual([{ code: "invalid_format", path: [], params: { format: "port" } }]);
    expect(accepts(port(), 65_536, 1.5, -1)).toEqual([false, false, false]);
    expect(issuesOf(port()("80"))[0]?.code).toBe("invalid_type");
  });
});

describe("uuid versions", () => {
  it("should require the version it is given, and then reject the nil and max UUIDs", () => {
    const v4 = "550e8400-e29b-41d4-a716-446655440000";
    const v7 = "0190a6b5-7c4e-7cc4-9a3f-3b8e2a1f9d10";
    expect(accepts(uuid({ version: 4 }), v4, v7, "00000000-0000-0000-0000-000000000000")).toEqual([true, false, false]);
    expect(accepts(uuid({ version: 7 }), v7)).toEqual([true]);
    expect(() => uuid({ version: 9 as never })).toThrow(RangeError);
    expect(() => uuid({ version: "4" as never })).toThrow(new TypeError("version must be a number, received string"));
  });
});

describe("base64url", () => {
  it("should accept the URL-safe alphabet with padding optional, and name the format", () => {
    expect(accepts(base64({ url: true }), "aGVsbG8", "aGVsbG8=", "-_-_")).toEqual([true, true, true]);
    expect(accepts(base64({ url: true }), "aGVsbG8+", "aGVsbG9", "a", "")).toEqual([false, false, false, false]);
    expect(formatOf(base64({ url: true })("+"))).toBe("base64url");
  });
});
