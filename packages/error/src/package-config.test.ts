import { describe, expect, it } from "vitest";

import packageJson from "../package.json";
import vitestConfig from "../vitest.config";

describe("package configuration", () => {
  it("should declare the supported Node.js baseline", () => {
    expect(packageJson.engines?.node).toBe(">=24");
  });

  it("should link the package page on codenhub.dev as its homepage", () => {
    expect(packageJson.homepage).toBe("https://codenhub.dev/packages/error/");
  });

  // Tools that locate a package's root or read its metadata resolve this subpath, and without the
  // entry they fail with ERR_PACKAGE_PATH_NOT_EXPORTED.
  it("should export its package.json", () => {
    expect(packageJson.exports["./package.json"]).toBe("./package.json");
  });

  it("should not silently exclude conventional source tests", () => {
    expect(vitestConfig.test?.exclude).toBeUndefined();
  });
});
