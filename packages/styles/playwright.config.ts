import os from "node:os";

import { defineConfig, devices } from "@playwright/test";

const isSourceMode = process.argv.includes("--ui") || process.env.STYLES_TEST_SOURCE === "1";
const cpuCount = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
/* One port per run, `STYLES_TEST_PORT` or 5184, held strictly: a server
   already on it is never reused, so a run cannot attach to another checkout's
   build and assert its CSS. Two checkouts testing at once pick two ports. */
const port = Number(process.env.STYLES_TEST_PORT ?? 5184);
const defaultWorkers = process.env.CI ? 2 : Math.min(4, Math.max(2, Math.floor(cpuCount / 2)));

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 120000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.PLAYWRIGHT_WORKERS ? Number(process.env.PLAYWRIGHT_WORKERS) : defaultWorkers,
  reporter: "list",
  webServer: [
    {
      command: `pnpm --filter=${isSourceMode ? "@codenhub/styles-dev" : "@codenhub/styles-debug"} dev --port ${port} --strictPort`,
      url: `http://localhost:${port}`,
      reuseExistingServer: false,
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
