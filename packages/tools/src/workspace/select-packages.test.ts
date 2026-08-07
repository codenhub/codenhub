import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { discoverWorkspace, type Workspace } from "./discover.ts";
import { findOwningPackage, selectPackages } from "./select-packages.ts";

let root: string;
let workspace: Workspace;

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(value), "utf8");
}

beforeAll(async () => {
  root = await mkdtemp(resolve(tmpdir(), "codenhub-tools-"));
  await writeFile(resolve(root, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n  - "packages/*/dev"\n', "utf8");
  await writeJson(resolve(root, "packages/alpha/package.json"), {
    name: "@fixture/alpha",
    scripts: { test: "vitest" },
  });
  await writeJson(resolve(root, "packages/beta/package.json"), { name: "@fixture/beta", private: true });
  await writeJson(resolve(root, "packages/alpha/dev/package.json"), { name: "@fixture/alpha-dev" });
  await writeJson(resolve(root, "packages/beta/dev/package.json"), { name: "@fixture/beta-dev" });
  await mkdir(resolve(root, "packages/alpha/src"), { recursive: true });
  await writeFile(resolve(root, "packages/alpha/src/index.test.ts"), "", "utf8");
  await writeFile(resolve(root, "packages/beta/index.test.ts"), "", "utf8");
  await mkdir(resolve(root, "docs"), { recursive: true });
  await writeFile(resolve(root, "docs/tooling.md"), "", "utf8");
  workspace = await discoverWorkspace(root);
});

afterAll(async () => {
  await rm(root, { force: true, recursive: true });
});

function select(tokens: string[], cwd = root, changedPaths?: string[]) {
  return selectPackages({ changedPaths, cwd, tokens, workspace });
}

describe("discoverWorkspace", () => {
  it("shouldFindEveryPackageDeclaredByTheManifest", () => {
    expect(workspace.packages.map(({ name }) => name)).toEqual([
      "@fixture/alpha",
      "@fixture/alpha-dev",
      "@fixture/beta",
      "@fixture/beta-dev",
    ]);
  });

  it("shouldReadPackageVisibilityAndScripts", () => {
    const [alpha, , beta] = workspace.packages;

    expect(alpha?.scripts.test).toBe("vitest");
    expect(alpha?.isPrivate).toBe(false);
    expect(beta?.isPrivate).toBe(true);
  });
});

describe("findOwningPackage", () => {
  it("shouldPreferTheDeepestNestedPackage", () => {
    expect(findOwningPackage(workspace.packages, "packages/alpha/dev/index.ts")?.name).toBe("@fixture/alpha-dev");
  });

  it("shouldReturnNothingForPathsOutsideEveryPackage", () => {
    expect(findOwningPackage(workspace.packages, "docs/readme.md")).toBeUndefined();
  });
});

describe("selectPackages", () => {
  it("shouldSelectTheWholeWorkspaceWhenNoTargetIsGiven", async () => {
    const selection = await select([]);

    expect(selection.isImplicit).toBe(true);
    expect(selection.targets).toHaveLength(4);
  });

  it("shouldSelectByPackageAlias", async () => {
    const selection = await select(["alpha"]);

    expect(selection.targets.map(({ package: found }) => found.name)).toEqual(["@fixture/alpha"]);
    expect(selection.targets[0]?.paths).toEqual([]);
  });

  it("shouldForwardAFilePathAsAPackageRelativePath", async () => {
    const selection = await select(["packages/alpha/src/index.test.ts"]);

    expect(selection.targets[0]?.package.name).toBe("@fixture/alpha");
    expect(selection.targets[0]?.paths).toEqual(["src/index.test.ts"]);
  });

  it("shouldResolvePathsRelativeToTheInvocationDirectory", async () => {
    const selection = await select(["src/index.test.ts"], resolve(root, "packages/alpha"));

    expect(selection.targets[0]?.package.name).toBe("@fixture/alpha");
    expect(selection.targets[0]?.paths).toEqual(["src/index.test.ts"]);
  });

  it("shouldExpandGlobsAcrossPackages", async () => {
    const selection = await select(["packages/*/*.test.ts"]);

    expect(selection.targets.map(({ package: found }) => found.name)).toEqual(["@fixture/beta"]);
  });

  it("shouldResolveAPathRelativeToAnAlreadySelectedPackage", async () => {
    const selection = await select(["alpha", "src/index.test.ts"]);

    expect(selection.targets).toHaveLength(1);
    expect(selection.targets[0]?.paths).toEqual(["src/index.test.ts"]);
  });

  it("shouldKeepPathsOutsideEveryPackageSeparate", async () => {
    const selection = await select(["docs/tooling.md"]);

    expect(selection.targets).toEqual([]);
    expect(selection.unownedPaths).toEqual(["docs/tooling.md"]);
    expect(selection.isImplicit).toBe(false);
  });

  it("shouldCombinePackagesAndUnownedPaths", async () => {
    const selection = await select(["alpha", "docs"]);

    expect(selection.targets.map(({ package: found }) => found.name)).toEqual(["@fixture/alpha"]);
    expect(selection.unownedPaths).toEqual(["docs"]);
  });

  it("shouldRejectUnknownTargetsWithASuggestion", async () => {
    await expect(select(["alpah"])).rejects.toThrow(/Unknown target "alpah".*Did you mean: alpha/s);
  });

  it("shouldRejectAmbiguousTargets", async () => {
    await expect(select(["dev"])).rejects.toThrow(/Ambiguous target "dev"/);
  });

  it("shouldNarrowAnExplicitSelectionToChangedPackages", async () => {
    const selection = await select(["alpha", "beta"], root, ["packages/beta/index.test.ts"]);

    expect(selection.targets.map(({ package: found }) => found.name)).toEqual(["@fixture/beta"]);
  });

  it("shouldSelectOnlyChangedPackagesWhenNoTargetIsGiven", async () => {
    const selection = await select([], root, ["packages/alpha/src/index.test.ts", "docs/readme.md"]);

    expect(selection.targets.map(({ package: found }) => found.name)).toEqual(["@fixture/alpha"]);
  });

  it("shouldSelectNothingWhenNoPackageChanged", async () => {
    expect((await select([], root, ["docs/readme.md"])).targets).toEqual([]);
  });
});
