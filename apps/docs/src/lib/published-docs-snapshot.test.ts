import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { MaterializeTreeOptions } from "@codenhub/tools/release";
import type { Workspace, WorkspacePackage } from "@codenhub/tools/workspace";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildPublishedDocsSnapshot,
  snapshotPackagesRoot,
  type PublishedDocsSnapshotDeps,
} from "./published-docs-snapshot.ts";

const DOCS_MANIFEST = { codenhub: { docs: { label: "Error", status: "active" } }, name: "@codenhub/error" };

function createPackage(root: string, location: string, name: string): WorkspacePackage {
  return {
    directory: path.join(root, location),
    directoryName: location.slice(location.lastIndexOf("/") + 1),
    isPrivate: false,
    location,
    manifest: { codenhub: { docs: { label: name, status: "active" } }, name },
    name,
    scripts: {},
    unscopedName: name.slice(name.lastIndexOf("/") + 1),
    workspaceDependencies: [],
  };
}

/**
 * Stands in for `git checkout-index`: writes the given files, keyed by
 * package-relative path, into whatever destination the builder asks for.
 */
function materializeFiles(files: Record<string, string>) {
  return vi.fn(async ({ destination }: MaterializeTreeOptions) => {
    await Promise.all(
      Object.entries(files).map(async ([relativePath, content]) => {
        const filePath = path.join(destination, ...relativePath.split("/"));
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, content, "utf8");
      }),
    );
    return true;
  });
}

const tempDirectories: string[] = [];

async function createTempDir(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "codenhub-docs-snapshot-"));
  tempDirectories.push(directory);
  return directory;
}

function createDeps(packages: WorkspacePackage[], overrides: Partial<PublishedDocsSnapshotDeps> = {}) {
  const workspace: Workspace = { packages, root: "/repo" };
  return {
    discoverWorkspace: vi.fn().mockResolvedValue(workspace),
    fetchReleaseTags: vi.fn().mockResolvedValue(true),
    listTags: vi.fn().mockResolvedValue([]),
    materializeTreeAtRef: vi.fn().mockResolvedValue(true),
    resolveLatestPublishedTag: vi.fn().mockReturnValue(undefined),
    ...overrides,
  } satisfies PublishedDocsSnapshotDeps;
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("buildPublishedDocsSnapshot", () => {
  it("materializes a released package from its latest tag at its workspace location", async () => {
    const repoRoot = await createTempDir();
    const snapshotRoot = await createTempDir();
    const deps = createDeps([createPackage(repoRoot, "packages/error", "@codenhub/error")], {
      listTags: vi.fn().mockResolvedValue(["@codenhub/error@0.3.0"]),
      materializeTreeAtRef: materializeFiles({
        "docs/index.md": "# Error\n\nPublished content.\n",
        "package.json": JSON.stringify(DOCS_MANIFEST),
      }),
      resolveLatestPublishedTag: vi.fn().mockReturnValue("@codenhub/error@0.3.0"),
    });

    await buildPublishedDocsSnapshot({ repoRoot, snapshotRoot }, deps);

    expect(deps.materializeTreeAtRef).toHaveBeenCalledWith({
      cwd: repoRoot,
      destination: path.join(snapshotRoot, "packages/error"),
      ref: "@codenhub/error@0.3.0",
      treePath: "packages/error",
    });
    await expect(readFile(path.join(snapshotRoot, "packages/error/docs/index.md"), "utf8")).resolves.toBe(
      "# Error\n\nPublished content.\n",
    );
  });

  it("keeps only the files the site publishes or validates", async () => {
    const repoRoot = await createTempDir();
    const snapshotRoot = await createTempDir();
    const deps = createDeps([createPackage(repoRoot, "packages/error", "@codenhub/error")], {
      materializeTreeAtRef: materializeFiles({
        LICENSE: "MIT\n",
        NOTICE: "Notice\n",
        "README.md": "# Error\n",
        "demo/package.json": "{}",
        "docs/assets/diagram.svg": "<svg/>",
        "docs/index.md": "# Error\n",
        "docs/internal/architecture.md": "# Internal\n",
        "llms-full.txt": "full\n",
        "llms.txt": "index\n",
        "package.json": JSON.stringify(DOCS_MANIFEST),
        "src/index.ts": "export {};\n",
        "src/index.test.ts": "export {};\n",
        "tsconfig.json": JSON.stringify({ extends: "../../tsconfig.json" }),
      }),
      resolveLatestPublishedTag: vi.fn().mockReturnValue("@codenhub/error@0.3.0"),
    });

    await buildPublishedDocsSnapshot({ repoRoot, snapshotRoot }, deps);

    const packageDirectory = path.join(snapshotRoot, "packages/error");
    await expect(readdir(packageDirectory).then((entries) => entries.sort())).resolves.toEqual([
      "LICENSE",
      "NOTICE",
      "README.md",
      "docs",
      "llms-full.txt",
      "llms.txt",
      "package.json",
    ]);
    await expect(readdir(path.join(packageDirectory, "docs")).then((entries) => entries.sort())).resolves.toEqual([
      "assets",
      "index.md",
    ]);
  });

  it("leaves a package with no release tag out entirely, whatever its working tree holds", async () => {
    const repoRoot = await createTempDir();
    const snapshotRoot = await createTempDir();
    const deps = createDeps([createPackage(repoRoot, "packages/toaster", "@codenhub/toaster")]);

    await buildPublishedDocsSnapshot({ repoRoot, snapshotRoot }, deps);

    expect(deps.materializeTreeAtRef).not.toHaveBeenCalled();
    await expect(readdir(snapshotPackagesRoot(snapshotRoot))).resolves.toEqual([]);
  });

  it("drops a released package whose manifest at that tag does not opt into docs", async () => {
    const repoRoot = await createTempDir();
    const snapshotRoot = await createTempDir();
    const deps = createDeps([createPackage(repoRoot, "packages/error", "@codenhub/error")], {
      materializeTreeAtRef: materializeFiles({
        "docs/index.md": "# Error\n",
        "package.json": JSON.stringify({ name: "@codenhub/error" }),
      }),
      resolveLatestPublishedTag: vi.fn().mockReturnValue("@codenhub/error@0.1.0"),
    });

    await buildPublishedDocsSnapshot({ repoRoot, snapshotRoot }, deps);

    await expect(readdir(snapshotPackagesRoot(snapshotRoot))).resolves.toEqual([]);
  });

  it("takes the opt-in from the manifest at the tag, not the one in the working tree", async () => {
    const repoRoot = await createTempDir();
    const snapshotRoot = await createTempDir();
    const livePackage = { ...createPackage(repoRoot, "packages/error", "@codenhub/error"), manifest: {} };
    const deps = createDeps([livePackage], {
      materializeTreeAtRef: materializeFiles({
        "docs/index.md": "# Error\n",
        "package.json": JSON.stringify(DOCS_MANIFEST),
      }),
      resolveLatestPublishedTag: vi.fn().mockReturnValue("@codenhub/error@0.3.0"),
    });

    await buildPublishedDocsSnapshot({ repoRoot, snapshotRoot }, deps);

    await expect(readdir(snapshotPackagesRoot(snapshotRoot))).resolves.toEqual(["error"]);
  });

  it("creates an empty packages root when nothing has released", async () => {
    const repoRoot = await createTempDir();
    const snapshotRoot = await createTempDir();

    await buildPublishedDocsSnapshot({ repoRoot, snapshotRoot }, createDeps([]));

    await expect(readdir(snapshotPackagesRoot(snapshotRoot))).resolves.toEqual([]);
  });

  it("clears whatever an earlier build left behind", async () => {
    const repoRoot = await createTempDir();
    const snapshotRoot = await createTempDir();
    await mkdir(path.join(snapshotRoot, "packages/stale"), { recursive: true });

    await buildPublishedDocsSnapshot({ repoRoot, snapshotRoot }, createDeps([]));

    await expect(readdir(snapshotPackagesRoot(snapshotRoot))).resolves.toEqual([]);
  });

  it("fails the build when tags cannot be fetched, rather than treating every package as unreleased", async () => {
    const repoRoot = await createTempDir();
    const snapshotRoot = await createTempDir();
    const deps = createDeps([createPackage(repoRoot, "packages/error", "@codenhub/error")], {
      fetchReleaseTags: vi.fn().mockResolvedValue(false),
    });

    await expect(buildPublishedDocsSnapshot({ repoRoot, snapshotRoot }, deps)).rejects.toThrow(
      "Could not fetch release tags",
    );
  });

  it("fails the build when a released package is no longer where its tag put it", async () => {
    const repoRoot = await createTempDir();
    const snapshotRoot = await createTempDir();
    const deps = createDeps([createPackage(repoRoot, "packages/plugins/vite/icons", "@codenhub/vite-plugin-icons")], {
      materializeTreeAtRef: vi.fn().mockResolvedValue(false),
      resolveLatestPublishedTag: vi.fn().mockReturnValue("@codenhub/vite-plugin-icons@0.0.1"),
    });

    await expect(buildPublishedDocsSnapshot({ repoRoot, snapshotRoot }, deps)).rejects.toThrow(
      "the package moved after its last release",
    );
  });

  it("fails the build when the tag holds a different package at that location", async () => {
    const repoRoot = await createTempDir();
    const snapshotRoot = await createTempDir();
    const deps = createDeps([createPackage(repoRoot, "packages/error", "@codenhub/error")], {
      materializeTreeAtRef: materializeFiles({ "package.json": JSON.stringify({ name: "@codenhub/other" }) }),
      resolveLatestPublishedTag: vi.fn().mockReturnValue("@codenhub/error@0.3.0"),
    });

    await expect(buildPublishedDocsSnapshot({ repoRoot, snapshotRoot }, deps)).rejects.toThrow(
      "has @codenhub/other at packages/error",
    );
  });

  it("fails the build when a tag cannot be read", async () => {
    const repoRoot = await createTempDir();
    const snapshotRoot = await createTempDir();
    const deps = createDeps([createPackage(repoRoot, "packages/error", "@codenhub/error")], {
      materializeTreeAtRef: vi.fn().mockRejectedValue(new Error("Could not read @codenhub/error@0.3.0")),
      resolveLatestPublishedTag: vi.fn().mockReturnValue("@codenhub/error@0.3.0"),
    });

    await expect(buildPublishedDocsSnapshot({ repoRoot, snapshotRoot }, deps)).rejects.toThrow(
      "Could not read @codenhub/error@0.3.0",
    );
  });
});
