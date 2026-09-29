import { describe, expect, it } from "vitest";

import { accepts, codesOf, issuesOf, valueOf } from "../test-utils";
import { nanoid } from "./nanoid";

describe("nanoid", () => {
  it("should accept valid values and leave them unchanged", () => {
    const valid = ["V1StGXR8_Z5jdHi6B-myT", "_-_-_-_-_-_-_-_-_-_-_"];
    expect(accepts(nanoid(), ...valid)).toEqual(valid.map(() => true));
    expect(valueOf(nanoid()(valid[0]))).toBe(valid[0]);
  });

  it("should reject invalid values", () => {
    const invalid = ["short", "V1StGXR8_Z5jdHi6B-my!", "", "V1StGXR8_Z5jdHi6B-myTT"];
    expect(accepts(nanoid(), ...invalid)).toEqual(invalid.map(() => false));
  });

  it("should report invalid_type for a non-string and invalid_format, naming the format, for a bad string", () => {
    expect(codesOf(nanoid()(42))).toEqual(["invalid_type"]);
    expect(issuesOf(nanoid()("!!"))).toEqual([{ code: "invalid_format", path: [], params: { format: "nanoid" } }]);
  });

  it("should not echo the input", () => {
    expect(JSON.stringify(issuesOf(nanoid()("hunter2!")))).not.toContain("hunter2");
  });
});
