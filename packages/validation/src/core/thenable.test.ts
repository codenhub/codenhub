import { describe, expect, it } from "vitest";

import { isThenable } from "./thenable";

// The thenables below are the subject of these tests, not accidents.
/* oxlint-disable unicorn/no-thenable */
describe("isThenable", () => {
  it("should recognize promises and other thenables", () => {
    expect(isThenable(Promise.resolve())).toBe(true);
    expect(isThenable({ then: () => undefined })).toBe(true);
    expect(isThenable(Object.assign(() => undefined, { then: () => undefined }))).toBe(true);
  });

  it("should reject everything else", () => {
    expect([undefined, null, 1, "then", {}, { then: 1 }].map(isThenable)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});
