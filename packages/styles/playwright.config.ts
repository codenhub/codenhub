import { defineConfig, devices } from "@playwright/test";

const isSourceMode = process.argv.includes("--ui") || process.env.STYLES_TEST_SOURCE === "1";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 120000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  reporter: "list",
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{ext}",
  webServer: [
    {
      command: isSourceMode
        ? "pnpm --filter=@codenhub/styles-dev dev -- --port 5184"
        : "pnpm --filter=@codenhub/styles-debug dev",
      url: "http://localhost:5184",
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
