import { describe, expect, it } from "vitest";

import { fromPunycode, isPunycodeHost } from "./punycode";

describe("fromPunycode", () => {
  it("should decode the samples of RFC 3492 and common labels", () => {
    expect(fromPunycode("mnchen-3ya")).toBe("münchen");
    expect(fromPunycode("ls8h")).toBe("💩");
    expect(fromPunycode("wgv71a119e")).toBe("日本語");
    expect(fromPunycode("egbpdaj6bu4bxfgehfvwxn")).toBe("ليهمابتكلموشعربي؟");
    expect(fromPunycode("Hello-Another-Way--fc4qua05auwb3674vfr0b")).toBe("Hello-Another-Way-それぞれの場所");
  });

  it("should give nothing for text that is not punycode", () => {
    expect(["zz", "e", "0x", "99999999999", "-", "ü-ab", "a-%"].map(fromPunycode)).toEqual(Array(7).fill(undefined));
  });
});

describe("isPunycodeHost", () => {
  it("should accept a host whose punycode labels are each a label the parser writes so", () => {
    expect(["example.com", "xn--mnchen-3ya.de", "a.xn--ls8h", "XN--MNCHEN-3YA.de"].map(isPunycodeHost)).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  /*
   * Chromium and WebKit read each of these as a host, where Node.js and Firefox refuse them, so the
   * check must not lean on the parser to refuse them.
   */
  it("should reject a punycode label that does not decode, or decodes to text that is no such label", () => {
    expect(
      ["xn--zz.com", "xn--a.com", "xn--e.com", "xn--m.com", "xn--0x.com", "a.xn--zz", "xn--abc-.com"].map(
        isPunycodeHost,
      ),
    ).toEqual(Array(7).fill(false));
  });

  // Node.js writes a letter before `xn--` as such a label, which its own parser then refuses to read.
  it("should reject a punycode label whose own text starts with xn--, which Node.js cannot read", () => {
    expect(["xn--xn---9oa.com", "XN--XN--A-9RA.com", "a.xn--xn---9oaa"].map(isPunycodeHost)).toEqual([
      false,
      false,
      false,
    ]);
    expect(isPunycodeHost("xn--xnxn---cva.com")).toBe(true);
  });
});
