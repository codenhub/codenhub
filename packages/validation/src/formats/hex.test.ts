import { describe, expect, it } from "vitest";

import { accepts, codesOf, issuesOf, valueOf } from "../test-utils";
import { hex } from "./hex";

describe("hex", () => {
  it("should accept valid values and leave them unchanged", () => {
    const valid = ["deadBEEF01", "0", "ABCDEF"];
    expect(accepts(hex(), ...valid)).toEqual(valid.map(() => true));
    expect(valueOf(hex()(valid[0]))).toBe(valid[0]);
  });

  it("should reject invalid values", () => {
    const invalid = ["xyz", "", "0x10", "12 34"];
    expect(accepts(hex(), ...invalid)).toEqual(invalid.map(() => false));
  });

  it("should report invalid_type for a non-string and invalid_format, naming the format, for a bad string", () => {
    expect(codesOf(hex()(42))).toEqual(["invalid_type"]);
    expect(issuesOf(hex()("!!"))).toEqual([{ code: "invalid_format", path: [], params: { format: "hex" } }]);
  });

  it("should not echo the input", () => {
    expect(JSON.stringify(issuesOf(hex()("hunter2!")))).not.toContain("hunter2");
  });
});
