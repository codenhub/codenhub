import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    forceRerunTriggers: ["src/**/*.css", "package.json"],
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 15000,
    /* The CSS is held by the browser suite, which V8 cannot instrument; the
       build command is the package's only code, so the report covers it alone. */
    coverage: {
      include: ["src/cli/**"],
    },
  },
});
