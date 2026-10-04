import { describe, expect, it } from "vitest";

import { accepts, codesOf, issuesOf, valueOf } from "../test-utils";
import { hostname } from "./hostname";

describe("hostname", () => {
  it("should accept valid values and leave them unchanged", () => {
    const valid = ["localhost", "a.example.com", "a-b.example.com", "EXAMPLE.com", "3com.com", "example.123x", "1a"];
    expect(accepts(hostname(), ...valid)).toEqual(valid.map(() => true));
    expect(valueOf(hostname()(valid[0]))).toBe(valid[0]);
  });

  it("should reject invalid values", () => {
    const invalid = [
      "-bad.com",
      "bad-.com",
      "a..b",
      "",
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.com",
      "a b.com",
      "999.999.999.999",
      "1.2.3.4",
      "123",
      "example.123",
    ];
    expect(accepts(hostname(), ...invalid)).toEqual(invalid.map(() => false));
  });

  it("should reject a name whose last label the URL parser reads as an IPv4 number, in hex as well", () => {
    const numeric = ["0x7f000001", "127.0.0.0x1", "0x7f.0x0.0x0.0x1", "foo.0x1", "foo.0X1F", "foo.0x", "a.1."];
    expect(accepts(hostname(), ...numeric)).toEqual(numeric.map(() => false));
    expect(accepts(hostname(), "0x7f.com", "foo.0xg", "foo.x0")).toEqual([true, true, true]);
  });

  it("should reject an absolute name ending in a dot, a second spelling of the same host", () => {
    expect(accepts(hostname(), "example.com.", "localhost.", ".", "example.com..")).toEqual(Array(4).fill(false));
    expect(accepts(hostname(), "example.com", "localhost")).toEqual([true, true]);
  });

  it("should accept only names the URL parser reads as a name, never as an IPv4 address", () => {
    const pieces = ["0x", "7f", "1", "a", "."];
    let candidates = [""];
    const misread: string[] = [];
    for (let length = 0; length < 5; length += 1) {
      candidates = candidates.flatMap((prefix) => pieces.map((piece) => prefix + piece));
      for (const text of candidates.filter((candidate) => hostname()(candidate).ok)) {
        if (!URL.canParse(`http://${text}`) || /^[\d.]+$/.test(new URL(`http://${text}`).hostname)) {
          misread.push(text);
        }
      }
    }
    expect(misread).toEqual([]);
  });

  it("should reject a punycode label that does not decode, and accept one that does", () => {
    expect(accepts(hostname(), "xn--zz.com", "a.xn--zz", "XN--ZZ")).toEqual([false, false, false]);
    expect(accepts(hostname(), "xn--xn---9oa.com")).toEqual([false]);
    expect(accepts(hostname(), "xn--mnchen-3ya.de", "a.xn--ls8h")).toEqual([true, true]);
  });

  it("should report invalid_type for a non-string and invalid_format, naming the format, for a bad string", () => {
    expect(codesOf(hostname()(42))).toEqual(["invalid_type"]);
    expect(issuesOf(hostname()("!!"))).toEqual([{ code: "invalid_format", path: [], params: { format: "hostname" } }]);
  });

  it("should not echo the input", () => {
    expect(JSON.stringify(issuesOf(hostname()("hunter2!")))).not.toContain("hunter2");
  });
});
