import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Eval fixtures are projects an agent works on; their tests use node:test and run inside each fixture.
    exclude: [...configDefaults.exclude, "evals/**"],
  },
});
