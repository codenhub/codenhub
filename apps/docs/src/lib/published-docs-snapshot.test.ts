import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Workspace, WorkspacePackage } from "@codenhub/tools/workspace";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildPublishedDocsSnapshot, type PublishedDocsSnapshotDeps } from "./published-docs-snapshot.ts";

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

async function writeManifest(root: string, location: string, name: string): Promise<void> {
  const directory = path.join(root, location);
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "package.json"),
    JSON.stringify({ codenhub: { docs: { label: name, status: "active" } }, name }),
    "utf8",
  );
}

async function writeLiveFile(root: string, location: string, relativePath: string, content: string): Promise<void> {
  const filePath = path.join(root, location, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

const tempDirectories: string[] = [];

async function createTempDir(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "codenhub-docs-snapshot-"));
  tempDirectories.push(directory);
  return directory;
}

function defaultDeps(overrides: Partial<PublishedDocsSnapshotDeps> = {}): PublishedDocsSnapshotDeps {
  return {
    discoverWorkspace: vi.fn(),
    fetchReleaseTags: vi.fn().mockResolvedValue(true),
    listFilesAtRef: vi.fn().mockResolvedValue([]),
    listTags: vi.fn().mockResolvedValue([]),
    readFileAtRef: vi.fn(),
    resolveLatestPublishedTag: vi.fn().mockReturnValue(undefined),
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("buildPublishedDocsSnapshot", () => {
  it("writes a published package's docs from its latest tag, not the working tree", async () => {
    const repoRoot = await createTempDir();
    const snapshotRoot = await createTempDir();
    await writeManifest(repoRoot, "packages/error", "@codenhub/error");
    await writeLiveFile(repoRoot, "packages/error", "docs/index.md", "# Error (unreleased draft)\n");

    const workspace: Workspace = {
      packages: [createPackage(repoRoot, "packages/error", "@codenhub/error")],
      root: repoRoot,
    };
    const deps = defaultDeps({
      discoverWorkspace: vi.fn().mockResolvedValue(workspace),
      listFilesAtRef: vi.fn().mockResolvedValue(["packages/error/docs/index.md"]),
      listTags: vi.fn().mockResolvedValue(["@codenhub/error@0.3.0"]),
      readFileAtRef: vi.fn().mockResolvedValue("# Error\n\nPublished content.\n"),
      resolveLatestPublishedTag: vi.fn().mockReturnValue("@codenhub/error@0.3.0"),
    });

    await buildPublishedDocsSnapshot({ repoRoot, snapshotRoot }, deps);

    const written = await readFile(path.join(snapshotRoot, "packages/error/docs/index.md"), "utf8");
    expect(written).toBe("# Error\n\nPublished content.\n");
    expect(deps.readFileAtRef).toHaveBeenCalledWith(repoRoot, "@codenhub/error@0.3.0", "packages/error/docs/index.md");
  });

  it("copies the manifest live, unpinned to any tag", async () => {
    const repoRoot = await createTempDir();
    const snapshotRoot = await createTempDir();
    await writeManifest(repoRoot, "packages/error", "@codenhub/error");
    await writeLiveFile(repoRoot, "packages/error", "docs/index.md", "# Error\n");

    const workspace: Workspace = {
      packages: [createPackage(repoRoot, "packages/error", "@codenhub/error")],
      root: repoRoot,
    };
    const deps = defaultDeps({ discoverWorkspace: vi.fn().mockResolvedValue(workspace) });

    await buildPublishedDocsSnapshot({ repoRoot, snapshotRoot }, deps);

    const manifest = JSON.parse(await readFile(path.join(snapshotRoot, "packages/error/package.json"), "utf8")) as {
      name: string;
    };
    expect(manifest.name).toBe("@codenhub/error");
  });

  it("falls back to the working tree when the package has never published", async () => {
    const repoRoot = await createTempDir();
    const snapshotRoot = await createTempDir();
    await writeManifest(repoRoot, "packages/icons", "@codenhub/icons");
    await writeLiveFile(repoRoot, "packages/icons", "docs/index.md", "# Icons (live)\n");

    const workspace: Workspace = {
      packages: [createPackage(repoRoot, "packages/icons", "@codenhub/icons")],
      root: repoRoot,
    };
    const deps = defaultDeps({ discoverWorkspace: vi.fn().mockResolvedValue(workspace) });

    await buildPublishedDocsSnapshot({ repoRoot, snapshotRoot }, deps);

    const written = await readFile(path.join(snapshotRoot, "packages/icons/docs/index.md"), "utf8");
    expect(written).toBe("# Icons (live)\n");
  });

  it("falls back to the working tree when a tag exists but has no docs yet", async () => {
    const repoRoot = await createTempDir();
    const snapshotRoot = await createTempDir();
    await writeManifest(repoRoot, "packages/icons", "@codenhub/icons");
    await writeLiveFile(repoRoot, "packages/icons", "docs/index.md", "# Icons (added after 0.1.0)\n");

    const workspace: Workspace = {
      packages: [createPackage(repoRoot, "packages/icons", "@codenhub/icons")],
      root: repoRoot,
    };
    const deps = defaultDeps({
      discoverWorkspace: vi.fn().mockResolvedValue(workspace),
      listTags: vi.fn().mockResolvedValue(["@codenhub/icons@0.1.0"]),
      resolveLatestPublishedTag: vi.fn().mockReturnValue("@codenhub/icons@0.1.0"),
    });

    await buildPublishedDocsSnapshot({ repoRoot, snapshotRoot }, deps);

    const written = await readFile(path.join(snapshotRoot, "packages/icons/docs/index.md"), "utf8");
    expect(written).toBe("# Icons (added after 0.1.0)\n");
  });

  it("excludes internal docs from both the tag and working-tree paths", async () => {
    const repoRoot = await createTempDir();
    const snapshotRoot = await createTempDir();
    await writeManifest(repoRoot, "packages/icons", "@codenhub/icons");
    await writeLiveFile(repoRoot, "packages/icons", "docs/index.md", "# Icons\n");
    await writeLiveFile(repoRoot, "packages/icons", "docs/internal/architecture.md", "# Internal\n");

    const workspace: Workspace = {
      packages: [createPackage(repoRoot, "packages/icons", "@codenhub/icons")],
      root: repoRoot,
    };
    const deps = defaultDeps({ discoverWorkspace: vi.fn().mockResolvedValue(workspace) });

    await buildPublishedDocsSnapshot({ repoRoot, snapshotRoot }, deps);

    const entries = await readdir(path.join(snapshotRoot, "packages/icons/docs"));
    expect(entries).toEqual(["index.md"]);
  });

  it("resolves a published package's tag even when its live docs/ no longer exists", async () => {
    const repoRoot = await createTempDir();
    const snapshotRoot = await createTempDir();
    // No live docs/ at all — only the manifest exists on disk.
    await writeManifest(repoRoot, "packages/error", "@codenhub/error");

    const workspace: Workspace = {
      packages: [createPackage(repoRoot, "packages/error", "@codenhub/error")],
      root: repoRoot,
    };
    const deps = defaultDeps({
      discoverWorkspace: vi.fn().mockResolvedValue(workspace),
      listFilesAtRef: vi.fn().mockResolvedValue(["packages/error/docs/index.md"]),
      listTags: vi.fn().mockResolvedValue(["@codenhub/error@0.3.0"]),
      readFileAtRef: vi.fn().mockResolvedValue("# Error\n\nPublished content.\n"),
      resolveLatestPublishedTag: vi.fn().mockReturnValue("@codenhub/error@0.3.0"),
    });

    await buildPublishedDocsSnapshot({ repoRoot, snapshotRoot }, deps);

    const written = await readFile(path.join(snapshotRoot, "packages/error/docs/index.md"), "utf8");
    expect(written).toBe("# Error\n\nPublished content.\n");
  });

  it("does not snapshot a package with no codenhub.docs opt-in, even with a live docs/ folder", async () => {
    const repoRoot = await createTempDir();
    const snapshotRoot = await createTempDir();
    await mkdir(path.join(repoRoot, "packages/tools"), { recursive: true });
    await writeFile(path.join(repoRoot, "packages/tools", "package.json"), JSON.stringify({ name: "@codenhub/tools" }));
    await writeLiveFile(repoRoot, "packages/tools", "docs/internal/architecture.md", "# Internal only\n");

    const workspace: Workspace = {
      packages: [
        {
          ...createPackage(repoRoot, "packages/tools", "@codenhub/tools"),
          manifest: { name: "@codenhub/tools" },
        },
      ],
      root: repoRoot,
    };
    const deps = defaultDeps({ discoverWorkspace: vi.fn().mockResolvedValue(workspace) });

    await buildPublishedDocsSnapshot({ repoRoot, snapshotRoot }, deps);

    // Nothing eligible, so the snapshot root is cleared and never recreated.
    await expect(readdir(snapshotRoot)).rejects.toThrow("ENOENT");
  });

  it("fails the build when tags cannot be fetched, rather than treating every package as unpublished", async () => {
    const repoRoot = await createTempDir();
    const snapshotRoot = await createTempDir();
    await writeManifest(repoRoot, "packages/error", "@codenhub/error");
    await writeLiveFile(repoRoot, "packages/error", "docs/index.md", "# Error\n");

    const workspace: Workspace = {
      packages: [createPackage(repoRoot, "packages/error", "@codenhub/error")],
      root: repoRoot,
    };
    const deps = defaultDeps({
      discoverWorkspace: vi.fn().mockResolvedValue(workspace),
      fetchReleaseTags: vi.fn().mockResolvedValue(false),
    });

    await expect(buildPublishedDocsSnapshot({ repoRoot, snapshotRoot }, deps)).rejects.toThrow(
      "Could not fetch release tags",
    );
  });

  it("fails the build when a file listed at a tag cannot actually be read", async () => {
    const repoRoot = await createTempDir();
    const snapshotRoot = await createTempDir();
    await writeManifest(repoRoot, "packages/error", "@codenhub/error");
    await writeLiveFile(repoRoot, "packages/error", "docs/index.md", "# Error (live)\n");

    const workspace: Workspace = {
      packages: [createPackage(repoRoot, "packages/error", "@codenhub/error")],
      root: repoRoot,
    };
    const deps = defaultDeps({
      discoverWorkspace: vi.fn().mockResolvedValue(workspace),
      listFilesAtRef: vi.fn().mockResolvedValue(["packages/error/docs/index.md"]),
      listTags: vi.fn().mockResolvedValue(["@codenhub/error@0.3.0"]),
      readFileAtRef: vi.fn().mockResolvedValue(undefined),
      resolveLatestPublishedTag: vi.fn().mockReturnValue("@codenhub/error@0.3.0"),
    });

    await expect(buildPublishedDocsSnapshot({ repoRoot, snapshotRoot }, deps)).rejects.toThrow(
      "was listed at @codenhub/error@0.3.0 but could not be read",
    );
  });

  it("does nothing when no workspace package opts into public docs", async () => {
    const repoRoot = await createTempDir();
    const snapshotRoot = await createTempDir();

    const workspace: Workspace = {
      packages: [
        { ...createPackage(repoRoot, "packages/tools", "@codenhub/tools"), manifest: { name: "@codenhub/tools" } },
      ],
      root: repoRoot,
    };
    const deps = defaultDeps({ discoverWorkspace: vi.fn().mockResolvedValue(workspace) });

    await buildPublishedDocsSnapshot({ repoRoot, snapshotRoot }, deps);

    expect(deps.fetchReleaseTags).not.toHaveBeenCalled();
  });
});
