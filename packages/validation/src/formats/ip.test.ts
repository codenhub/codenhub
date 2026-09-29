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
});
