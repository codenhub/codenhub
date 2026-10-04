import { describe, expect, it } from "vitest";

import { accepts, codesOf, issuesOf, valueOf } from "../test-utils";
import { ulid } from "./ulid";

describe("ulid", () => {
  it("should accept valid values and leave them unchanged", () => {
    const valid = ["01ARZ3NDEKTSV4RRFFQ69G5FAV", "01arz3ndektsv4rrffq69g5fav"];
    expect(accepts(ulid(), ...valid)).toEqual(valid.map(() => true));
    expect(valueOf(ulid()(valid[0]))).toBe(valid[0]);
  });

  it("should accept the largest timestamp a ULID holds and reject the first past it", () => {
    expect(accepts(ulid(), "7ZZZZZZZZZZZZZZZZZZZZZZZZZ", "80000000000000000000000000")).toEqual([true, false]);
  });

  it("should reject invalid values", () => {
    const invalid = ["01ARZ3NDEKTSV4RRFFQ69G5FAU!", "81ARZ3NDEKTSV4RRFFQ69G5FAV", "", "short"];
    expect(accepts(ulid(), ...invalid)).toEqual(invalid.map(() => false));
  });

  it("should report invalid_type for a non-string and invalid_format, naming the format, for a bad string", () => {
    expect(codesOf(ulid()(42))).toEqual(["invalid_type"]);
    expect(issuesOf(ulid()("!!"))).toEqual([{ code: "invalid_format", path: [], params: { format: "ulid" } }]);
  });

  it("should not echo the input", () => {
    expect(JSON.stringify(issuesOf(ulid()("hunter2!")))).not.toContain("hunter2");
  });
});
