import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Node.js 25 and later shadow the jsdom environment's localStorage (packages/AGENTS.md).
    execArgv: ["--no-experimental-webstorage"],
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/**/*.test.ts"],
    },
  },
});
