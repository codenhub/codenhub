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
const vitePluginDeferCss = createPackage("@codenhub/vite-plugin-defer-css", "packages/plugins/vite/defer-css");
const demo = createPackage("@codenhub/demo", "apps/demo");
const themeDemo = createPackage("@codenhub/theme-demo", "packages/theme/demo");
const iconsDev = createPackage("@codenhub/icons-dev", "packages/icons/dev");
const themeDev = createPackage("@codenhub/theme-dev", "packages/theme/dev");
const index = createAliasIndex([icons, vitePluginDeferCss, demo, themeDemo, iconsDev, themeDev]);

describe("lookupPackage", () => {
  it("shouldMatchTheFullPackageName", () => {
    expect(lookupPackage(index, "@codenhub/vite-plugin-defer-css")).toEqual({
      kind: "match",
      package: vitePluginDeferCss,
    });
  });

  it("shouldMatchTheUnscopedPackageName", () => {
    expect(lookupPackage(index, "vite-plugin-defer-css")).toEqual({ kind: "match", package: vitePluginDeferCss });
  });

  it("shouldMatchTheWorkspaceLocation", () => {
    expect(lookupPackage(index, "packages/plugins/vite/defer-css")).toEqual({
      kind: "match",
      package: vitePluginDeferCss,
    });
  });

  it("shouldPreferAPackageNameOverANestedDirectoryName", () => {
    expect(lookupPackage(index, "demo")).toEqual({ kind: "match", package: demo });
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
