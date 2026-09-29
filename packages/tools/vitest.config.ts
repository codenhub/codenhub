import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Many of these tests drive real processes: git, npm, the TypeScript
    // compiler, TypeDoc. Alone they finish well inside Vitest's five-second
    // default, but sharing the machine with the rest of the suite pushes a
    // different one past it on each run, most often on Windows. A hang still
    // fails, only later.
    testTimeout: 15_000,
  },
});
