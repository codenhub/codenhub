import { describe, expect, it } from "vitest";

import { accepts, codesOf, issuesOf, valueOf } from "../test-utils";
import { uuid } from "./uuid";

describe("uuid", () => {
  it("should accept valid values and leave them unchanged", () => {
    const valid = [
      "123e4567-e89b-12d3-a456-426614174000",
      "550e8400-e29b-41d4-a716-446655440000",
      "123E4567-E89B-12D3-A456-426614174000",
    ];
    expect(accepts(uuid(), ...valid)).toEqual(valid.map(() => true));
    expect(valueOf(uuid()(valid[0]))).toBe(valid[0]);
  });

  it("should accept the nil and max UUIDs, which RFC 9562 defines outside the versions", () => {
    expect(
      accepts(
        uuid(),
        "00000000-0000-0000-0000-000000000000",
        "ffffffff-ffff-ffff-ffff-ffffffffffff",
        "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF",
      ),
    ).toEqual([true, true, true]);
    expect(uuid()("00000000-0000-0000-0000-000000000001").ok).toBe(false);
  });

  it("should reject invalid values", () => {
    const invalid = ["123e4567e89b12d3a456426614174000", "not-a-uuid", "123e4567-e89b-92d3-a456-426614174000", ""];
    expect(accepts(uuid(), ...invalid)).toEqual(invalid.map(() => false));
  });

  it("should report invalid_type for a non-string and invalid_format, naming the format, for a bad string", () => {
    expect(codesOf(uuid()(42))).toEqual(["invalid_type"]);
    expect(issuesOf(uuid()("!!"))).toEqual([{ code: "invalid_format", path: [], params: { format: "uuid" } }]);
  });

  it("should not echo the input", () => {
    expect(JSON.stringify(issuesOf(uuid()("hunter2!")))).not.toContain("hunter2");
  });
});
