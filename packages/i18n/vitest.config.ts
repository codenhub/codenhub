import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Node.js 25 and later shadow the jsdom environment's localStorage (packages/AGENTS.md).
    execArgv: ["--no-experimental-webstorage"],
    environment: "jsdom",
    exclude: [...configDefaults.exclude, "tests/browser/**"],
  },
});
