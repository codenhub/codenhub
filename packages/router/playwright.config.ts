import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: 1,
  retries: process.env.CI ? 2 : 1,
  reporter: [["list"], ["./tests/exit-reporter.ts"]],
  webServer: [
    {
      command: "pnpm --filter=@codenhub/router-dev dev",
      url: "http://localhost:5187",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "pnpm --filter=@codenhub/router-debug dev",
      url: "http://localhost:5188",
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
