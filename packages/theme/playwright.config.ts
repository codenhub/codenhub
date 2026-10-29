import { defineConfig, devices } from "@playwright/test";

// `hub test:browser` sets PLAYWRIGHT_WORKERS to this package's share of the machine's browsers. Run any
// other way, a worker for each core launched more browsers than a 16 GB machine held; see the worker
// comment in `packages/jwt/playwright.config.ts`.
const DEFAULT_WORKERS = 2;

/**
 * Reads the worker count from `PLAYWRIGHT_WORKERS`. Playwright takes a count only as a number, and
 * `Number` of text that is no number is NaN, which it takes and then runs no worker for, so anything
 * but a positive integer is refused here.
 */
function readWorkers(): number {
  const given = process.env.PLAYWRIGHT_WORKERS;
  if (given === undefined || given === "") {
    return DEFAULT_WORKERS;
  }
  const count = Number(given);
  if (!Number.isInteger(count) || count < 1) {
    throw new TypeError(`PLAYWRIGHT_WORKERS must be a positive integer, received "${given}"`);
  }
  return count;
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: readWorkers(),
  reporter: [["list"], ["./tests/exit-reporter.ts"]],
  webServer: [
    {
      command: "pnpm --filter=@codenhub/theme-dev dev",
      url: "http://localhost:5185",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "pnpm --filter=@codenhub/theme-debug dev",
      url: "http://localhost:5186",
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
