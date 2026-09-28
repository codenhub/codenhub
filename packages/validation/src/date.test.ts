import { describe, expect, it } from "vitest";

import { val } from "./index";
import { codesOf, messagesOf } from "./test-utils";

describe("date", () => {
  it("accepts valid Date instances and rejects Invalid Date, strings and timestamps", () => {
    expect(val.date().validate(new Date(0)).ok).toBe(true);
    expect(messagesOf(val.date().validate(new Date("nope")))).toEqual(["Expected date, received date"]);
    expect(val.date().validate("2026-01-01").ok).toBe(false);
    expect(val.date().validate(0).ok).toBe(false);
  });

  it("min and max are inclusive", () => {
    const bound = new Date("2026-01-01T00:00:00Z");
    expect(
      [new Date("2025-12-31T23:59:59Z"), bound, new Date("2026-01-02")].map(
        (d) => val.date().min(bound).validate(d).ok,
      ),
    ).toEqual([false, true, true]);
    expect(
      [new Date("2025-12-31"), bound, new Date("2026-01-02")].map((d) => val.date().max(bound).validate(d).ok),
    ).toEqual([true, true, false]);
    expect(codesOf(val.date().min(bound).validate(new Date(0)))).toEqual(["too_small"]);
  });
});
