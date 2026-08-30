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

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
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
