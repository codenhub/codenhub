import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: [["list"], ["./tests/exit-reporter.ts"]],
  webServer: [
    {
      command: "pnpm --filter=@codenhub/styles-dev dev",
      url: "http://localhost:5183",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "pnpm --filter=@codenhub/styles-debug dev",
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
