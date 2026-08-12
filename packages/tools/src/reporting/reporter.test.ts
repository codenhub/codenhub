import { describe, expect, it } from "vitest";

import { createReporter, formatDuration, type SummaryRow } from "./reporter.ts";

function capture(): { lines: string[]; reporter: ReturnType<typeof createReporter> } {
  const lines: string[] = [];
  return {
    lines,
    reporter: createReporter({
      useColor: false,
      write: (line) => lines.push(line),
      writeError: (line) => lines.push(line),
    }),
  };
}

const rows: readonly SummaryRow[] = [
  { label: "a", status: "passed" },
  { label: "b", status: "passed" },
  { label: "c", status: "failed" },
  { label: "d", status: "skipped" },
];

describe("formatDuration", () => {
  it("shouldReportSubSecondDurationsInMilliseconds", () => {
    expect(formatDuration(820)).toBe("820ms");
  });

  it("shouldReportLongerDurationsInSeconds", () => {
    expect(formatDuration(12_400)).toBe("12.4s");
  });
});

describe("tally", () => {
  it("shouldCountEveryOutcomeOnOneLine", () => {
    const { lines, reporter } = capture();
    reporter.tally(rows);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("1 failed");
    expect(lines[0]).toContain("2 passed");
    expect(lines[0]).toContain("1 skipped");
  });

  it("shouldLeadWithTheOutcomeThatNeedsReading", () => {
    const { lines, reporter } = capture();
    reporter.tally(rows);
    const line = lines[0] as string;

    expect(line.indexOf("1 failed")).toBeLessThan(line.indexOf("2 passed"));
  });

  it("shouldNameOnlyTheOutcomesThatOccurred", () => {
    const { lines, reporter } = capture();
    reporter.tally([{ label: "a", status: "passed" }]);

    expect(lines[0]).toContain("1 passed");
    expect(lines[0]).not.toContain("failed");
  });

  it("shouldAppendADurationWhenGivenOne", () => {
    const { lines, reporter } = capture();
    reporter.tally([{ label: "a", status: "passed" }], 1500);

    expect(lines[0]).toContain("in 1.5s");
  });

  it("shouldSayNothingForAnEmptyRun", () => {
    const { lines, reporter } = capture();
    reporter.tally([]);

    expect(lines).toEqual([]);
  });
});

describe("summarize", () => {
  it("shouldAlignLabelsIntoATable", () => {
    const { lines, reporter } = capture();
    reporter.summarize([
      { detail: "1.0s", label: "short", status: "passed" },
      { detail: "2.0s", label: "much-longer", status: "failed" },
    ]);

    expect(lines[0]).toContain("PASS  short      ");
    expect(lines[1]).toContain("FAIL  much-longer");
  });
});
