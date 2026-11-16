import { describe, expect, it } from "vitest";

import packageJson from "../package.json";

describe("package configuration", () => {
  it("should declare the supported Node.js baseline", () => {
    expect(packageJson.engines?.node).toBe(">=26");
  });

  it("should link the package page on codenhub.dev as its homepage", () => {
    expect(packageJson.homepage).toBe("https://codenhub.dev/packages/skills/");
  });
});
