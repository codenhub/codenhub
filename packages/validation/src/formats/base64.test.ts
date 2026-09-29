import { describe, expect, it } from "vitest";

import { accepts, codesOf, issuesOf, valueOf } from "../test-utils";
import { base64 } from "./base64";

describe("base64", () => {
  it("should accept valid values and leave them unchanged", () => {
    const valid = ["aGVsbG8=", "aGVsbG8gd29ybGQ=", "YWJj", ""];
    expect(accepts(base64(), ...valid)).toEqual(valid.map(() => true));
    expect(valueOf(base64()(valid[0]))).toBe(valid[0]);
  });

  it("should reject invalid values", () => {
    const invalid = ["aGVsbG8", "!!!!", "aGVsbG8==="];
    expect(accepts(base64(), ...invalid)).toEqual(invalid.map(() => false));
  });

  it("should report invalid_type for a non-string and invalid_format, naming the format, for a bad string", () => {
    expect(codesOf(base64()(42))).toEqual(["invalid_type"]);
    expect(issuesOf(base64()("!!"))).toEqual([{ code: "invalid_format", path: [], params: { format: "base64" } }]);
  });

  it("should not echo the input", () => {
    expect(JSON.stringify(issuesOf(base64()("hunter2!")))).not.toContain("hunter2");
  });
});
