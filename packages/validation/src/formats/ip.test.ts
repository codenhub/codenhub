import { isIPv6 } from "node:net";

import { describe, expect, it } from "vitest";

import { accepts, codesOf, issuesOf } from "../test-utils";
import { ip } from "./ip";

describe("ip", () => {
  it("should accept both families by default and reject everything else", () => {
    expect(accepts(ip(), "192.168.0.1", "::1", "2001:db8::ff00:42:8329", "256.1.1.1", "1.2.3", "nope", "")).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it("should reject IPv4 addresses with leading zeros or extra parts", () => {
    expect(accepts(ip(), "01.1.1.1", "1.1.1.1.1", "1.1.1.")).toEqual([false, false, false]);
  });

  it("should narrow to one family", () => {
    expect(accepts(ip({ version: "v4" }), "192.168.0.1", "::1")).toEqual([true, false]);
    expect(accepts(ip({ version: "v6" }), "192.168.0.1", "::1")).toEqual([false, true]);
  });

  it("should name the format after the family in the issue", () => {
    expect(issuesOf(ip()("x"))[0]?.params).toEqual({ format: "ip" });
    expect(issuesOf(ip({ version: "v4" })("x"))[0]?.params).toEqual({ format: "ipv4" });
    expect(issuesOf(ip({ version: "v6" })("x"))[0]?.params).toEqual({ format: "ipv6" });
  });

  it("should reject a non-string as invalid_type", () => {
    expect(codesOf(ip()(1))).toEqual(["invalid_type"]);
  });

  describe("IPv6", () => {
    it("should accept an IPv4 address in place of the last two groups", () => {
      expect(
        accepts(ip({ version: "v6" }), "::1.2.3.4", "::ffff:1.2.3.4", "::7:131.103.24.57", "1:2:3:4:5:6:1.2.3.4"),
      ).toEqual([true, true, true, true]);
    });

    it("should reject leading zeros and out-of-range parts in the IPv4 tail", () => {
      expect(accepts(ip({ version: "v6" }), "::ffff:01.2.3.4", "::ffff:1.2.3.04", "::ffff:1.2.3.256")).toEqual([
        false,
        false,
        false,
      ]);
    });

    it("should reject an IPv4 tail that is too long or in the wrong place", () => {
      expect(accepts(ip({ version: "v6" }), "1:2:3:4:5:6:7:1.2.3.4", "1.2.3.4::", "::1.2.3.4:1", "1.2.3.4")).toEqual([
        false,
        false,
        false,
        false,
      ]);
    });

    it("should count groups: eight without ::, fewer than eight with it", () => {
      expect(accepts(ip({ version: "v6" }), "1:2:3:4:5:6:7:8", "1:2:3:4:5:6:7", "1:2:3:4:5:6:7:8:9")).toEqual([
        true,
        false,
        false,
      ]);
      expect(accepts(ip({ version: "v6" }), "::", "1::", "::8", "1:2:3:4:5:6:7::", "1:2:3:4:5:6:7:8::")).toEqual([
        true,
        true,
        true,
        true,
        false,
      ]);
    });

    it("should reject a second ::, a lone colon at either end, and groups over four digits", () => {
      expect(
        accepts(ip({ version: "v6" }), "1::2::3", ":1:2:3:4:5:6:7", "1:2:3:4:5:6:7:", ":::", "12345::", "g::"),
      ).toEqual(Array(6).fill(false));
    });

    it("should accept a zone only after a link-local address", () => {
      expect(
        accepts(ip({ version: "v6" }), "fe80::1%eth0", "febf::1%en0", "fe80::%1", "2001:db8::1%eth0", "::1%eth0"),
      ).toEqual([true, true, true, false, false]);
      expect(accepts(ip({ version: "v6" }), "fe80::1%", "fe80::1%a b", "fe80::1%a%b", "fec0::1%eth0")).toEqual(
        Array(4).fill(false),
      );
    });

    it("should agree with node:net on addresses without a zone", () => {
      // A seeded generator, so a failure names the same address on every run.
      let seed = 12_345;
      const random = (): number => {
        seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
        return seed / 2_147_483_648;
      };
      const pick = (choices: string): string => choices.charAt(Math.floor(random() * choices.length));
      const group = (): string =>
        Array.from({ length: 1 + Math.floor(random() * 5) }, () => pick("0123456789abcdefAF")).join("");
      const candidate = (): string => {
        let text = Array.from({ length: Math.floor(random() * 10) }, group).join(":");
        if (random() < 0.5) {
          const at = Math.floor(random() * (text.length + 1));
          text = `${text.slice(0, at)}::${text.slice(at)}`;
        }
        if (random() < 0.2) {
          text += `:${Array.from({ length: 4 }, () => Math.floor(random() * 300)).join(".")}`;
        }
        return random() < 0.05 ? `:${text}` : text;
      };
      const validator = ip({ version: "v6" });

      const disagreements = Array.from({ length: 50_000 }, candidate).filter(
        (text) => validator(text).ok !== isIPv6(text),
      );
      expect(disagreements).toEqual([]);
    });
  });
});
