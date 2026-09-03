import { defineConfig, devices } from "@playwright/test";

const ENGINES = [
  { device: "Desktop Chrome", name: "chromium" },
  { device: "Desktop Firefox", name: "firefox" },
  { device: "Desktop Safari", name: "webkit" },
] as const;

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  reporter: "list",
  webServer: {
    command: "vite --host 127.0.0.1 --port 5192 --strictPort",
    url: "http://127.0.0.1:5192/tests/browser/",
    reuseExistingServer: !process.env.CI,
  },
  projects: ENGINES.map((engine) => ({
    name: `package-${engine.name}`,
    use: { ...devices[engine.device], baseURL: "http://127.0.0.1:5192" },
  })),
});
