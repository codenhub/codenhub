import { defineConfig, devices } from "@playwright/test";

/* The suite runs twice against each engine: once on the source playground and
   once on the built package, because a bug that only the build introduces is
   invisible to a run that never loads it. */
const SURFACES = [
  { baseURL: "http://localhost:5189", name: "source" },
  { baseURL: "http://localhost:5190", name: "package" },
] as const;

/* Project names end in the engine so CI can select one engine across every
   package with `--project='*<engine>*'`; see `docs/ci.md`. */
const ENGINES = [
  { device: "Desktop Chrome", name: "chromium" },
  { device: "Desktop Firefox", name: "firefox" },
  { device: "Desktop Safari", name: "webkit" },
] as const;

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
  testDir: "./tests/browser",
  fullyParallel: true,
  workers: readWorkers(),
  reporter: "list",
  webServer: [
    {
      command: "pnpm --filter=@codenhub/toaster-dev dev",
      url: "http://localhost:5189",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "pnpm --filter=@codenhub/toaster-debug dev",
      url: "http://localhost:5190",
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: SURFACES.flatMap((surface) =>
    ENGINES.map((engine) => ({
      name: `${surface.name}-${engine.name}`,
      use: { ...devices[engine.device], baseURL: surface.baseURL },
    })),
  ),
});
