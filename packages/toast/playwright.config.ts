import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  reporter: "list",
  webServer: [
    {
      command: "pnpm --filter=@codenhub/toast-dev dev",
      url: "http://localhost:5189",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "pnpm --filter=@codenhub/toast-debug dev",
      url: "http://localhost:5190",
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    {
      name: "source-chromium",
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:5189" },
    },
    {
      name: "package-chromium",
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:5190" },
    },
  ],
});
