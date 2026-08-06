import { describe, expect, it } from "vitest";

import { mapConcurrent, mapSeries } from "./concurrency.ts";

function defer(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

describe("mapSeries", () => {
  it("shouldPreserveInputOrder", async () => {
    expect(await mapSeries([3, 1, 2], async (value) => value * 2)).toEqual([6, 2, 4]);
  });

  it("shouldNeverOverlapOperations", async () => {
    let active = 0;
    let peak = 0;

    await mapSeries([1, 2, 3, 4], async () => {
      active += 1;
      peak = Math.max(peak, active);
      await defer(1);
      active -= 1;
    });

    expect(peak).toBe(1);
  });

  it("shouldHandleAnEmptyInput", async () => {
    expect(await mapSeries([], async () => 1)).toEqual([]);
  });

  it("shouldPropagateFailures", async () => {
    await expect(mapSeries([1], async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
  });
});

describe("mapConcurrent", () => {
  it("shouldPreserveInputOrderRegardlessOfCompletionOrder", async () => {
    const results = await mapConcurrent([30, 1, 15], 3, async (value) => {
      await defer(value);
      return value;
    });

    expect(results).toEqual([30, 1, 15]);
  });

  it("shouldRespectTheConcurrencyLimit", async () => {
    let active = 0;
    let peak = 0;

    await mapConcurrent([1, 2, 3, 4, 5], 2, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await defer(2);
      active -= 1;
    });

    expect(peak).toBeLessThanOrEqual(2);
  });

  it("shouldRejectAnUnusableLimit", async () => {
    await expect(mapConcurrent([1], 0, async (value) => value)).rejects.toThrow(/positive integer/);
    await expect(mapConcurrent([1], 1.5, async (value) => value)).rejects.toThrow(/positive integer/);
  });
});
