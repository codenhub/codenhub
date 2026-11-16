import { describe, expect, it } from "vitest";

import packageJson from "../package.json";

describe("package configuration", () => {
  it("should declare the supported Node.js baseline", () => {
    expect(packageJson.engines?.node).toBe(">=26");
  });
});
