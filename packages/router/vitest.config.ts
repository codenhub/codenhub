import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environmentMatchGlobs: [
      ["src/core/ssr.test.ts", "node"],
      ["src/**", "jsdom"],
    ],
  },
});
