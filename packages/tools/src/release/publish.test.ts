import { describe, expect, it } from "vitest";

import type { WorkspacePackage } from "../workspace/discover.ts";
import { parseReleaseTag, resolveTagTarget } from "./publish.ts";

function createPackage(name: string, version = "1.0.0", isPrivate = false): WorkspacePackage {
  const unscopedName = name.slice(name.lastIndexOf("/") + 1);
  return {
    directory: `/repo/packages/${unscopedName}`,
    directoryName: unscopedName,
    isPrivate,
    location: `packages/${unscopedName}`,
    manifest: { name, private: isPrivate, version },
    name,
    scripts: {},
    unscopedName,
    workspaceDependencies: [],
  };
}

describe("parseReleaseTag", () => {
  it("splits a scoped name from its version at the last separator", () => {
    expect(parseReleaseTag("@codenhub/error@0.3.0")).toEqual({ name: "@codenhub/error", version: "0.3.0" });
  });

  it("splits an unscoped name", () => {
    expect(parseReleaseTag("hub@2.1.0")).toEqual({ name: "hub", version: "2.1.0" });
  });

  it("keeps a pre-release version whole", () => {
    expect(parseReleaseTag("@codenhub/error@1.0.0-beta.1")).toEqual({
      name: "@codenhub/error",
      version: "1.0.0-beta.1",
    });
  });

  it("rejects a tag carrying no version", () => {
    expect(parseReleaseTag("v1.0.0")).toBeUndefined();
    expect(parseReleaseTag("@codenhub/error")).toBeUndefined();
    expect(parseReleaseTag("@codenhub/error@")).toBeUndefined();
  });
});

describe("resolveTagTarget", () => {
  const packages = [createPackage("@codenhub/error", "0.3.0"), createPackage("@codenhub/tools", "1.0.0", true)];

  it("resolves a tag whose version matches the manifest", () => {
    expect(resolveTagTarget("@codenhub/error@0.3.0", packages)).toEqual({ package: packages[0] });
  });

  it("refuses a version the manifest does not declare", () => {
    const result = resolveTagTarget("@codenhub/error@0.4.0", packages);

    expect(result).toMatchObject({ reason: "version-mismatch" });
  });

  it("refuses a private package", () => {
    expect(resolveTagTarget("@codenhub/tools@1.0.0", packages)).toMatchObject({ reason: "private" });
  });

  it("refuses a name no package carries", () => {
    expect(resolveTagTarget("@codenhub/ghost@1.0.0", packages)).toMatchObject({ reason: "unknown-package" });
  });

  it("refuses a tag that is not shaped like a release", () => {
    expect(resolveTagTarget("v0.3.0", packages)).toMatchObject({ reason: "malformed" });
  });
});
