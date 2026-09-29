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
