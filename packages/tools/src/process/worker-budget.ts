import { availableParallelism, totalmem } from "node:os";

const BYTES_PER_GIB = 1024 ** 3;

/** What a worker budget is sized from. */
export interface Machine {
  /** Cores the process may use. */
  cores: number;
  /** Physical memory in bytes. */
  memoryBytes: number;
}

/**
 * A test runner's own worker pool, shared out among the packages a run starts at once.
 *
 * Each runner sizes its pool from the whole machine, unaware that `hub` started five
 * more beside it, so left alone the pools multiply. On a 16 GB Windows machine six
 * Vitest pools of fifteen workers and their neighbors brought commit charge to
 * within 1.4 GB of the limit, and editors and browser tabs crashed before the tests
 * failed on timeouts.
 */
export interface WorkerPool {
  /** Environment variable the runner reads its worker count from. */
  variable: string;
  /**
   * Workers the whole run may hold at once.
   * @param machine Machine the run is on.
   * @returns A positive worker count.
   */
  capacity(machine: Machine): number;
}

/** Vitest's pool: a worker per GiB of memory, and never more than one per core. */
export const TEST_WORKER_POOL: WorkerPool = {
  capacity: ({ cores, memoryBytes }) => Math.max(1, Math.min(cores, Math.floor(memoryBytes / BYTES_PER_GIB))),
  variable: "VITEST_MAX_WORKERS",
};

/**
 * Playwright's pool: a browser per 8 GiB of memory.
 *
 * Each worker is a whole browser. Two is what a 16 GB Windows machine held without
 * WebKit losing its page; see the worker comment in `packages/jwt/playwright.config.ts`.
 * Half a GiB of slack absorbs what a 16 GB machine under-reports, which is a few
 * hundred MiB, without rounding a 12 GiB machine up to two browsers.
 */
export const BROWSER_WORKER_POOL: WorkerPool = {
  capacity: ({ memoryBytes }) => Math.max(1, Math.floor((memoryBytes + BYTES_PER_GIB / 2) / (8 * BYTES_PER_GIB))),
  variable: "PLAYWRIGHT_WORKERS",
};

/** How a run shares a worker pool out. */
export interface WorkerShare {
  /** Packages started at the same time. */
  concurrency: number;
  /** Workers each package may start, or `undefined` when the environment already sets them. */
  workersPerPackage?: number;
}

/**
 * Reads the machine this process runs on.
 * @returns Cores and physical memory.
 */
export function currentMachine(): Machine {
  return { cores: availableParallelism(), memoryBytes: totalmem() };
}

/**
 * Shares a worker pool out among the packages a run starts at once.
 *
 * No more packages start than the pool has workers, so a pool of two browsers runs two
 * packages at one worker each rather than six at one each. A worker count already set
 * in the environment is left alone, along with the requested concurrency: whoever set
 * it has taken charge of the budget.
 * @param pool Runner pool to share.
 * @param concurrency Packages the run was asked to start at once.
 * @param environment Environment the scripts inherit.
 * @param machine Machine the run is on.
 * @returns Concurrency to run at and each package's share of workers.
 */
export function shareWorkers(
  pool: WorkerPool,
  concurrency: number,
  environment: Readonly<Record<string, string | undefined>> = process.env,
  machine: Machine = currentMachine(),
): WorkerShare {
  const given = environment[pool.variable];
  if (given !== undefined && given !== "") {
    return { concurrency };
  }
  const capacity = pool.capacity(machine);
  const packages = Math.max(1, Math.min(concurrency, capacity));
  return { concurrency: packages, workersPerPackage: Math.max(1, Math.floor(capacity / packages)) };
}
