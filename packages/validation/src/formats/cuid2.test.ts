import { describe, expect, it } from "vitest";

import { accepts, codesOf, issuesOf, valueOf } from "../test-utils";
import { cuid2 } from "./cuid2";

describe("cuid2", () => {
  it("should accept valid values and leave them unchanged", () => {
    const valid = ["tz4a98xxat96iws9zmbrgj3a"];
    expect(accepts(cuid2(), ...valid)).toEqual(valid.map(() => true));
    expect(valueOf(cuid2()(valid[0]))).toBe(valid[0]);
  });

  it("should reject invalid values", () => {
    const invalid = ["1bad", "TZ4A98XXAT96IWS9ZMBRGJ3A", "short", ""];
    expect(accepts(cuid2(), ...invalid)).toEqual(invalid.map(() => false));
  });

  it("should report invalid_type for a non-string and invalid_format, naming the format, for a bad string", () => {
    expect(codesOf(cuid2()(42))).toEqual(["invalid_type"]);
    expect(issuesOf(cuid2()("!!"))).toEqual([{ code: "invalid_format", path: [], params: { format: "cuid2" } }]);
  });

  it("should not echo the input", () => {
    expect(JSON.stringify(issuesOf(cuid2()("hunter2!")))).not.toContain("hunter2");
  });
});
