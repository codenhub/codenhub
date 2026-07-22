import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    forceRerunTriggers: ["src/**/*.css", "package.json"],
    globalSetup: ["./tests/integration/global-setup.ts"],
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 15000,
  },
});
