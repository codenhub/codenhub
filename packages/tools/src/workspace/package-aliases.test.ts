import { describe, expect, it } from "vitest";

import type { WorkspacePackage } from "./discover.ts";
import { createAliasIndex, lookupPackage, suggestAliases } from "./package-aliases.ts";

function createPackage(name: string, location: string): WorkspacePackage {
  return {
    directory: `/repo/${location}`,
    directoryName: location.slice(location.lastIndexOf("/") + 1),
    isPrivate: false,
    manifest: {},
    location,
    name,
    scripts: {},
    unscopedName: name.slice(name.lastIndexOf("/") + 1),
    workspaceDependencies: [],
  };
}

const icons = createPackage("@codenhub/icons", "packages/icons");
const vitePluginIcons = createPackage("@codenhub/vite-plugin-icons", "packages/plugins/vite/icons");
const iconsDev = createPackage("@codenhub/icons-dev", "packages/icons/dev");
const themeDev = createPackage("@codenhub/theme-dev", "packages/theme/dev");
const index = createAliasIndex([icons, vitePluginIcons, iconsDev, themeDev]);

describe("lookupPackage", () => {
  it("shouldMatchTheFullPackageName", () => {
    expect(lookupPackage(index, "@codenhub/vite-plugin-icons")).toEqual({ kind: "match", package: vitePluginIcons });
  });

  it("shouldMatchTheUnscopedPackageName", () => {
    expect(lookupPackage(index, "vite-plugin-icons")).toEqual({ kind: "match", package: vitePluginIcons });
  });

  it("shouldMatchTheWorkspaceLocation", () => {
    expect(lookupPackage(index, "packages/plugins/vite/icons")).toEqual({ kind: "match", package: vitePluginIcons });
  });

  it("shouldPreferAPackageNameOverANestedDirectoryName", () => {
    expect(lookupPackage(index, "icons")).toEqual({ kind: "match", package: icons });
  });

  it("shouldReportAmbiguityBetweenCollidingDirectoryNames", () => {
    const lookup = lookupPackage(index, "dev");

    expect(lookup.kind).toBe("ambiguous");
    expect(lookup.kind === "ambiguous" ? lookup.candidates : []).toEqual([iconsDev, themeDev]);
  });

  it("shouldReportUnknownTokens", () => {
    expect(lookupPackage(index, "nothing-like-this")).toEqual({ kind: "unknown" });
  });
});

describe("suggestAliases", () => {
  it("shouldSuggestTheClosestAlias", () => {
    expect(suggestAliases(index, "icnos")[0]).toBe("icons");
  });

  it("shouldReturnNothingForCompletelyUnrelatedTokens", () => {
    expect(suggestAliases(index, "zzzzzzzzzzzzzzzz")).toEqual([]);
  });
});
