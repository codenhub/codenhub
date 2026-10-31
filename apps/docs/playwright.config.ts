import { defineConfig, devices } from "@playwright/test";

const ENGINES = [
  { device: "Desktop Chrome", name: "chromium" },
  { device: "Desktop Firefox", name: "firefox" },
  { device: "Desktop Safari", name: "webkit" },
] as const;

// Match the package configs: hub assigns each suite its share of the browser budget.
const DEFAULT_WORKERS = 2;

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
  webServer: {
    command: "node tests/browser/server.ts",
    env: { NODE_ENV: "test" },
    // The site root is a redirect only the Cloudflare host serves, so preview answers it with 404.
    url: "http://127.0.0.1:5195/oidc/reference/provider/",
    // A build of every package's docs takes about a minute on a developer machine.
    timeout: 240_000,
    // Always build this checkout; an existing server may serve stale or released docs.
    reuseExistingServer: false,
  },
  projects: ENGINES.map((engine) => ({
    name: engine.name,
    // Only Chromium supports granting both clipboard permissions through Playwright.
    testIgnore: engine.name === "chromium" ? [] : ["**/signature-copy.spec.ts"],
    use: { ...devices[engine.device], baseURL: "http://127.0.0.1:5195" },
  })),
});
