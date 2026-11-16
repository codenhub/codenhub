import { describe, expect, it } from "vitest";

import type { Workspace, WorkspacePackage } from "../workspace/discover.ts";
import { findAffectedSites, type DeployedSite } from "./affected-sites.ts";

function createPackage(location: string, workspaceDependencies: readonly string[] = []): WorkspacePackage {
  const directoryName = location.slice(location.lastIndexOf("/") + 1);
  const name = `@fixture/${location.replaceAll("/", "-")}`;
  return {
    directory: `/repo/${location}`,
    directoryName,
    isPrivate: true,
    location,
    manifest: { name },
    name,
    scripts: {},
    unscopedName: name.slice(name.indexOf("/") + 1),
    workspaceDependencies,
  };
}

// `site` depends on `shared`, which depends on `base`; `shared/demo` is nested in `shared` but
// is a package of its own that `site` does not depend on; `other` is outside the site's graph.
const base = createPackage("packages/base");
const shared = createPackage("packages/shared", [base.name]);
const sharedDemo = createPackage("packages/shared/demo", [shared.name]);
const other = createPackage("packages/other");
const site = createPackage("apps/site", [shared.name]);
const gallery = createPackage("apps/gallery", [sharedDemo.name]);

const workspace: Workspace = { packages: [base, shared, sharedDemo, other, site, gallery], root: "/repo" };

const SITES: readonly DeployedSite[] = [
  { alsoReads: /^packages\/.+\/package\.json$/, location: "apps/site" },
  { location: "apps/gallery" },
];

function affected(...paths: string[]): string[] {
  return findAffectedSites(workspace, paths, SITES);
}

describe("findAffectedSites", () => {
  it("selects a site whose own files changed", () => {
    expect(affected("apps/site/src/pages/index.astro")).toEqual(["site"]);
  });

  it("selects a site when a direct or transitive dependency's source changed", () => {
    expect(affected("packages/shared/src/index.ts")).toEqual(["site", "gallery"]);
    expect(affected("packages/base/src/index.ts")).toEqual(["site", "gallery"]);
  });

  it("does not treat a nested package as part of the package it sits in", () => {
    expect(affected("packages/shared/demo/src/main.ts")).toEqual(["gallery"]);
  });

  it("selects no site for a package outside every site's graph", () => {
    expect(affected("packages/other/src/index.ts")).toEqual([]);
  });

  it("selects no site for a path outside every package", () => {
    expect(affected("docs/ci.md", ".github/workflows/ci.yml", "AGENTS.md")).toEqual([]);
  });

  it.each([
    "packages/shared/README.md",
    "packages/shared/README.pt-BR.md",
    "packages/shared/LICENSE",
    "packages/shared/NOTICE",
    "packages/shared/llms.txt",
    "packages/shared/llms-full.txt",
    "packages/shared/AGENTS.md",
    "packages/shared/docs/guide.md",
    "packages/shared/tests/integration/build.test.ts",
    "packages/shared/src/index.test.ts",
    "packages/shared/vitest.config.ts",
    "packages/shared/playwright.config.ts",
    "packages/shared/tsconfig.test.json",
    "packages/shared/bench/render.ts",
    "packages/shared/playground/index.html",
    "apps/site/AGENTS.md",
    "apps/site/astro-config.test.ts",
  ])("ignores %s, which no site build reads from the working tree", (path) => {
    expect(affected(path)).toEqual([]);
  });

  it("still selects a site for build files that share a name with ignored ones", () => {
    expect(affected("packages/shared/src/docs/render.ts")).toEqual(["site", "gallery"]);
    expect(affected("packages/shared/src/README.ts")).toEqual(["site", "gallery"]);
  });

  it.each(["pnpm-lock.yaml", "pnpm-workspace.yaml", "package.json", "tsconfig.json", ".nvmrc", ".npmrc"])(
    "selects every site when %s changed",
    (path) => {
      expect(affected(path)).toEqual(["site", "gallery"]);
    },
  );

  it("ignores lint and format configuration, which no build reads", () => {
    expect(affected(".oxlintrc.json", ".oxfmtrc.json", ".prettierrc.json5")).toEqual([]);
  });

  it("selects a site when a path it also reads changed", () => {
    expect(affected("packages/other/package.json")).toEqual(["site"]);
    expect(affected("packages/other/demo/package.json")).toEqual(["site"]);
  });

  it("lists sites in the order they are declared", () => {
    expect(affected("apps/gallery/src/index.ts", "apps/site/src/index.ts")).toEqual(["site", "gallery"]);
  });

  it("fails when a declared site is not a workspace package", () => {
    expect(() => findAffectedSites(workspace, [], [{ location: "apps/missing" }])).toThrow("apps/missing");
  });
});
