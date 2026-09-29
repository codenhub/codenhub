import { describe, expect, it } from "vitest";

import { accepts, codesOf, issuesOf, valueOf } from "../test-utils";
import { email } from "./email";

describe("email", () => {
  it("should accept ordinary addresses and leave them unchanged", () => {
    expect(valueOf(email()("Me.Name+tag@Example.COM"))).toBe("Me.Name+tag@Example.COM");
  });

  it("should accept subdomains and internationalized top-level domains in punycode", () => {
    expect(accepts(email(), "a@mail.example.co.uk", "a@example.xn--p1ai")).toEqual([true, true]);
  });

  it("should accept an internationalized domain and leave the address as written", () => {
    expect(valueOf(email()("ada@münchen.de"))).toBe("ada@münchen.de");
    expect(accepts(email(), "ada@例え.jp", "ada@bücher.example.co.uk", "ada@xn--mnchen-3ya.de")).toEqual([
      true,
      true,
      true,
    ]);
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
