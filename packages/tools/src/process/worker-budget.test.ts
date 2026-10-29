import { describe, expect, it } from "vitest";

import { BROWSER_WORKER_POOL, type Machine, shareWorkers, TEST_WORKER_POOL } from "./worker-budget.ts";

const GIB = 1024 ** 3;
// What a 16 GB machine reports: a little under 16 GiB.
const LAPTOP: Machine = { cores: 16, memoryBytes: 15.7 * GIB };

describe("shareWorkers", () => {
  it("shouldSplitTestWorkersAmongTheConcurrentPackages", () => {
    expect(shareWorkers(TEST_WORKER_POOL, 6, {}, LAPTOP)).toEqual({ concurrency: 6, workersPerPackage: 2 });
  });

  it("shouldGiveASinglePackageTheWholeTestPool", () => {
    expect(shareWorkers(TEST_WORKER_POOL, 1, {}, LAPTOP)).toEqual({ concurrency: 1, workersPerPackage: 15 });
  });

  it("shouldNotGiveTestsMoreWorkersThanCores", () => {
    const machine = { cores: 4, memoryBytes: 64 * GIB };

    expect(shareWorkers(TEST_WORKER_POOL, 1, {}, machine)).toEqual({ concurrency: 1, workersPerPackage: 4 });
  });

  it("shouldStartNoMorePackagesThanThePoolHasBrowsers", () => {
    expect(shareWorkers(BROWSER_WORKER_POOL, 6, {}, LAPTOP)).toEqual({ concurrency: 2, workersPerPackage: 1 });
  });

  it("shouldGiveOneBrowserPackageEveryBrowser", () => {
    expect(shareWorkers(BROWSER_WORKER_POOL, 1, {}, LAPTOP)).toEqual({ concurrency: 1, workersPerPackage: 2 });
  });

  it("shouldNotRoundAMachineBetweenSizesUpToTheNextBrowser", () => {
    const machine = { cores: 16, memoryBytes: 12 * GIB };

    expect(shareWorkers(BROWSER_WORKER_POOL, 1, {}, machine)).toEqual({ concurrency: 1, workersPerPackage: 1 });
  });

  it("shouldKeepAtLeastOneWorkerOnASmallMachine", () => {
    const machine = { cores: 1, memoryBytes: 0.5 * GIB };

    expect(shareWorkers(BROWSER_WORKER_POOL, 6, {}, machine)).toEqual({ concurrency: 1, workersPerPackage: 1 });
    expect(shareWorkers(TEST_WORKER_POOL, 6, {}, machine)).toEqual({ concurrency: 1, workersPerPackage: 1 });
  });

  it("shouldLeaveTheBudgetToAWorkerCountSetInTheEnvironment", () => {
    expect(shareWorkers(BROWSER_WORKER_POOL, 6, { PLAYWRIGHT_WORKERS: "4" }, LAPTOP)).toEqual({ concurrency: 6 });
  });

  it("shouldTreatAnEmptyVariableAsUnset", () => {
    expect(shareWorkers(TEST_WORKER_POOL, 6, { VITEST_MAX_WORKERS: "" }, LAPTOP)).toEqual({
      concurrency: 6,
      workersPerPackage: 2,
    });
  });
});
