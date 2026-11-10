import { describe, expect, it } from "vitest";

import type { WorkspacePackage } from "./discover.ts";
import { readPackageTimeoutMs } from "./package-timeout.ts";

function createPackage(manifest: Record<string, unknown>): WorkspacePackage {
  return {
    directory: "/repo/packages/slow",
    directoryName: "slow",
    isPrivate: false,
    location: "packages/slow",
    manifest,
    name: "slow",
    scripts: {},
    unscopedName: "slow",
    workspaceDependencies: [],
  };
}

describe("readPackageTimeoutMs", () => {
  it("shouldReadTheDeclaredSecondsAsMilliseconds", () => {
    expect(readPackageTimeoutMs(createPackage({ codenhub: { tools: { timeout: 1800 } } }))).toBe(1_800_000);
  });

  it("shouldAcceptAFractionOfASecond", () => {
    expect(readPackageTimeoutMs(createPackage({ codenhub: { tools: { timeout: 0.5 } } }))).toBe(500);
  });

  it.each([
    ["no codenhub field", {}],
    ["no tools field", { codenhub: { label: "Slow" } }],
    ["no timeout", { codenhub: { tools: {} } }],
  ])("shouldDeclareNothingWithout%s", (_name, manifest) => {
    expect(readPackageTimeoutMs(createPackage(manifest))).toBeUndefined();
  });

  it.each([0, -1, "600", null, Number.POSITIVE_INFINITY, 1e308, true])("shouldRejectATimeoutOf%s", (timeout) => {
    expect(() => readPackageTimeoutMs(createPackage({ codenhub: { tools: { timeout } } }))).toThrow(
      /Invalid codenhub\.tools\.timeout in slow: expected a positive number of seconds/,
    );
  });

  it("shouldRejectToolsThatIsNotAnObject", () => {
    expect(() => readPackageTimeoutMs(createPackage({ codenhub: { tools: 1800 } }))).toThrow(
      /Invalid codenhub\.tools in slow: expected an object/,
    );
  });
});
