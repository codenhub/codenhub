import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { WorkspacePackage } from "../workspace/discover.ts";
import { declaresPlaywright, planBrowserInstalls } from "./playwright.ts";

function createPackage(root: string, location: string, manifest: Record<string, unknown> = {}): WorkspacePackage {
  const name = location.slice(location.lastIndexOf("/") + 1);
  return {
    directory: join(root, location),
    directoryName: name,
    isPrivate: false,
    location,
    manifest,
    name: `@codenhub/${name}`,
    scripts: {},
    unscopedName: name,
    workspaceDependencies: [],
  };
}

function withPlaywright(root: string, location: string): WorkspacePackage {
  return createPackage(root, location, { devDependencies: { "@playwright/test": "catalog:" } });
}

/**
 * Creates a workspace with Playwright installed in the given directories.
 *
 * Both shim names are written so the fixture matches whichever one the current
 * platform resolves. A `version` installs a manifest too, which is what groups
 * packages onto one install.
 * @param installations Directories to install into, each with an optional version.
 * @returns Absolute fixture root.
 */
async function createWorkspaceFixture(
  installations: readonly (string | { directory: string; version: string })[],
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "codenhub-browsers-"));
  await Promise.all(
    installations.map(async (installation) => {
      const { directory, version } =
        typeof installation === "string" ? { directory: installation, version: undefined } : installation;
      const binDirectory = join(root, directory, "node_modules", ".bin");
      await mkdir(binDirectory, { recursive: true });
      await Promise.all(["playwright", "playwright.CMD"].map(async (name) => writeFile(join(binDirectory, name), "")));
      if (version === undefined) {
        return;
      }
      const manifestDirectory = join(root, directory, "node_modules", "@playwright", "test");
      await mkdir(manifestDirectory, { recursive: true });
      await writeFile(join(manifestDirectory, "package.json"), JSON.stringify({ name: "@playwright/test", version }));
    }),
  );
  return root;
}

describe("declaresPlaywright", () => {
  it("reads every dependency field", () => {
    expect(declaresPlaywright(withPlaywright("/repo", "packages/toast"))).toBe(true);
    expect(
      declaresPlaywright(createPackage("/repo", "packages/toast", { dependencies: { "@playwright/test": "^1.0.0" } })),
    ).toBe(true);
  });

  it("ignores a package that only runs unit tests", () => {
    expect(
      declaresPlaywright(createPackage("/repo", "packages/error", { devDependencies: { vitest: "catalog:" } })),
    ).toBe(false);
  });
});

describe("planBrowserInstalls", () => {
  it("plans one install per Playwright version", async () => {
    const root = await createWorkspaceFixture([
      { directory: "packages/toast", version: "1.61.1" },
      { directory: "packages/theme", version: "1.62.0" },
    ]);
    const packages = [withPlaywright(root, "packages/toast"), withPlaywright(root, "packages/theme")];

    const specs = await planBrowserInstalls(root, packages);

    expect(specs).toHaveLength(2);
    expect(specs.map(({ cwd }) => cwd)).toEqual([join(root, "packages/toast"), join(root, "packages/theme")]);
    expect(specs[0]?.args).toEqual(["install"]);
  });

  it("installs once for packages on the same version", async () => {
    const root = await createWorkspaceFixture([
      { directory: "packages/toast", version: "1.61.1" },
      { directory: "packages/theme", version: "1.61.1" },
    ]);
    const packages = [withPlaywright(root, "packages/toast"), withPlaywright(root, "packages/theme")];

    const specs = await planBrowserInstalls(root, packages);

    expect(specs).toHaveLength(1);
    expect(specs[0]?.cwd).toBe(join(root, "packages/toast"));
  });

  it("installs once for packages sharing a hoisted CLI", async () => {
    const root = await createWorkspaceFixture([""]);
    const packages = [withPlaywright(root, "packages/toast"), withPlaywright(root, "packages/theme")];

    const specs = await planBrowserInstalls(root, packages);

    expect(specs).toHaveLength(1);
  });

  it("skips packages that do not declare Playwright", async () => {
    const root = await createWorkspaceFixture(["packages/toast"]);
    const packages = [createPackage(root, "packages/error"), withPlaywright(root, "packages/toast")];

    const specs = await planBrowserInstalls(root, packages);

    expect(specs).toHaveLength(1);
    expect(specs[0]?.cwd).toBe(join(root, "packages/toast"));
  });

  it("forwards extra arguments to Playwright", async () => {
    const root = await createWorkspaceFixture(["packages/toast"]);

    const specs = await planBrowserInstalls(root, [withPlaywright(root, "packages/toast")], ["--with-deps"]);

    expect(specs[0]?.args).toEqual(["install", "--with-deps"]);
  });

  it("fails when the runner is declared but not installed", async () => {
    const root = await createWorkspaceFixture([]);

    await expect(planBrowserInstalls(root, [withPlaywright(root, "packages/toast")])).rejects.toThrow(
      /no Playwright CLI is installed/,
    );
  });
});
