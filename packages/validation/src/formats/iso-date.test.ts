import { describe, expect, it } from "vitest";

import { accepts, codesOf, issuesOf, valueOf } from "../test-utils";
import { isoDate } from "./iso-date";

describe("isoDate", () => {
  it("should accept calendar dates that exist and return them as strings", () => {
    expect(valueOf(isoDate()("2026-09-28"))).toBe("2026-09-28");
    expect(accepts(isoDate(), "2024-02-29", "2000-01-01")).toEqual([true, true]);
  });

  it("should reject days that do not exist and other shapes", () => {
    expect(
      accepts(
        isoDate(),
        "2026-02-29",
        "2026-13-01",
        "2026-00-10",
        "2026-04-31",
        "26-09-28",
        "2026-9-28",
        "2026-09-28T00:00:00Z",
        "",
      ),
    ).toEqual(Array(8).fill(false));
  });

  it("should reject a non-string, including a Date", () => {
    expect(codesOf(isoDate()(new Date()))).toEqual(["invalid_type"]);
  });

  it("should name the format date in the issue", () => {
    expect(issuesOf(isoDate()("nope"))[0]?.params).toEqual({ format: "date" });
  });
});
