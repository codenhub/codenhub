import { defineConfig, devices } from "@playwright/test";

const ENGINES = [
  { device: "Desktop Chrome", name: "chromium" },
  { device: "Desktop Firefox", name: "firefox" },
  { device: "Desktop Safari", name: "webkit" },
] as const;

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  // A worker for each core launched ten browsers at once, which ran a 16 GB machine out of memory.
  // Given as text, which Playwright refuses unless it is a count; `Number` of other text is NaN, which it takes.
  workers: process.env.PLAYWRIGHT_WORKERS ?? 3,
  reporter: "list",
  webServer: {
    command: "vite --host 127.0.0.1 --port 5193 --strictPort",
    url: "http://127.0.0.1:5193/tests/browser/",
    reuseExistingServer: !process.env.CI,
  },
  projects: ENGINES.map((engine) => ({
    name: `package-${engine.name}`,
    use: { ...devices[engine.device], baseURL: "http://127.0.0.1:5193" },
  })),
});
