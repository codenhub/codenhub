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
