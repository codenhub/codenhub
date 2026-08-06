import { describe, expect, it } from "vitest";

import packageJson from "../package.json";
import vitestConfig from "../vitest.config";

describe("package configuration", () => {
  it("should advance the patch version for JSON serialization support", () => {
    expect(packageJson.version).toBe("0.2.1");
  });

  it("should build declarations before typechecking package self-imports", () => {
    expect(packageJson.scripts.typecheck).toBe("pnpm build && tsc --noEmit");
  });

  it("should omit the built-export test from source watch mode", () => {
    expect(packageJson.scripts["test:watch"]).toBe("pnpm build && vitest --exclude src/package.test.ts");
  });

  it("should not silently exclude conventional source tests", () => {
    expect(vitestConfig.test?.exclude).toBeUndefined();
  });
});
