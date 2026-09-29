import { describe, expect, it } from "vitest";

import { accepts, codesOf, issuesOf, valueOf } from "../test-utils";
import { hostname } from "./hostname";

describe("hostname", () => {
  it("should accept valid values and leave them unchanged", () => {
    const valid = ["localhost", "a.example.com", "a-b.example.com", "EXAMPLE.com"];
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
    ];
    expect(accepts(hostname(), ...invalid)).toEqual(invalid.map(() => false));
  });

  it("should report invalid_type for a non-string and invalid_format, naming the format, for a bad string", () => {
    expect(codesOf(hostname()(42))).toEqual(["invalid_type"]);
    expect(issuesOf(hostname()("!!"))).toEqual([{ code: "invalid_format", path: [], params: { format: "hostname" } }]);
  });

  it("should not echo the input", () => {
    expect(JSON.stringify(issuesOf(hostname()("hunter2!")))).not.toContain("hunter2");
  });
});
