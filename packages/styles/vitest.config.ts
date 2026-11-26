import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    forceRerunTriggers: ["src/**/*.css", "package.json"],
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 15000,
    /* The CSS is held by the browser suite, which V8 cannot instrument, so the
       report covers the package's code alone: the command, the plugin, and the
       engine they share. */
    coverage: {
      include: ["src/**/*.ts"],
    },
  },
});
