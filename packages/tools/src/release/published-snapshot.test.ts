import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { Workspace, WorkspacePackage } from "../workspace/discover.ts";
import {
  buildPublishedSnapshot,
  buildReleaseHistory,
  snapshotPackagesRoot,
  snapshotReleasesPath,
  type PublishedSnapshotDeps,
} from "./published-snapshot.ts";
import type { MaterializeTreeOptions } from "./tag-content.ts";

const DOCS_MANIFEST = { codenhub: { label: "Error", status: "active", docs: {} }, name: "@codenhub/error" };

function createPackage(root: string, location: string, name: string): WorkspacePackage {
  return {
    directory: path.join(root, location),
    directoryName: location.slice(location.lastIndexOf("/") + 1),
    isPrivate: false,
    location,
    manifest: { codenhub: { label: name, status: "active", docs: {} }, name },
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

function createDeps(packages: WorkspacePackage[], overrides: Partial<PublishedSnapshotDeps> = {}) {
  const workspace: Workspace = { packages, root: "/repo" };
  return {
    discoverWorkspace: vi.fn().mockResolvedValue(workspace),
    fetchReleaseTags: vi.fn().mockResolvedValue(true),
    listTagDates: vi.fn().mockResolvedValue(new Map<string, string>()),
    materializeTreeAtRef: vi.fn().mockResolvedValue(true),
    resolveLatestPublishedTag: vi.fn().mockReturnValue(undefined),
    ...overrides,
  } satisfies PublishedSnapshotDeps;
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("buildPublishedSnapshot", () => {
  it("materializes a released package from its latest tag at its workspace location", async () => {
    const repoRoot = await createTempDir();
    const snapshotRoot = await createTempDir();
    const deps = createDeps([createPackage(repoRoot, "packages/error", "@codenhub/error")], {
      listTagDates: vi.fn().mockResolvedValue(new Map([["@codenhub/error@0.3.0", "2026-10-09T12:00:00+00:00"]])),
      materializeTreeAtRef: materializeFiles({
        "docs/index.md": "# Error\n\nPublished content.\n",
        "package.json": JSON.stringify(DOCS_MANIFEST),
      }),
      resolveLatestPublishedTag: vi.fn().mockReturnValue("@codenhub/error@0.3.0"),
    });

    await buildPublishedSnapshot({ repoRoot, snapshotRoot }, deps);

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

    await buildPublishedSnapshot({ repoRoot, snapshotRoot }, deps);

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

    await buildPublishedSnapshot({ repoRoot, snapshotRoot }, deps);

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

    await buildPublishedSnapshot({ repoRoot, snapshotRoot }, deps);

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

    await buildPublishedSnapshot({ repoRoot, snapshotRoot }, deps);

    await expect(readdir(snapshotPackagesRoot(snapshotRoot))).resolves.toEqual(["error"]);
  });

  it("creates an empty packages root when nothing has released", async () => {
    const repoRoot = await createTempDir();
    const snapshotRoot = await createTempDir();

    await buildPublishedSnapshot({ repoRoot, snapshotRoot }, createDeps([]));

    await expect(readdir(snapshotPackagesRoot(snapshotRoot))).resolves.toEqual([]);
  });

  it("clears whatever an earlier build left behind", async () => {
    const repoRoot = await createTempDir();
    const snapshotRoot = await createTempDir();
    await mkdir(path.join(snapshotRoot, "packages/stale"), { recursive: true });

    await buildPublishedSnapshot({ repoRoot, snapshotRoot }, createDeps([]));

    await expect(readdir(snapshotPackagesRoot(snapshotRoot))).resolves.toEqual([]);
  });

  it("fails the build when tags cannot be fetched, rather than treating every package as unreleased", async () => {
    const repoRoot = await createTempDir();
    const snapshotRoot = await createTempDir();
    const deps = createDeps([createPackage(repoRoot, "packages/error", "@codenhub/error")], {
      fetchReleaseTags: vi.fn().mockResolvedValue(false),
    });

    await expect(buildPublishedSnapshot({ repoRoot, snapshotRoot }, deps)).rejects.toThrow(
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

    await expect(buildPublishedSnapshot({ repoRoot, snapshotRoot }, deps)).rejects.toThrow(
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

    await expect(buildPublishedSnapshot({ repoRoot, snapshotRoot }, deps)).rejects.toThrow(
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

    await expect(buildPublishedSnapshot({ repoRoot, snapshotRoot }, deps)).rejects.toThrow(
      "Could not read @codenhub/error@0.3.0",
    );
  });

  it("writes the release history of every released package beside the packages", async () => {
    const repoRoot = await createTempDir();
    const snapshotRoot = await createTempDir();
    const deps = createDeps([createPackage(repoRoot, "packages/error", "@codenhub/error")], {
      listTagDates: vi.fn().mockResolvedValue(
        new Map([
          ["@codenhub/error@0.2.0", "2026-08-01T00:00:00+00:00"],
          ["@codenhub/error@0.3.0", "2026-10-09T00:00:00+00:00"],
        ]),
      ),
      materializeTreeAtRef: materializeFiles({ "package.json": JSON.stringify(DOCS_MANIFEST) }),
      resolveLatestPublishedTag: vi.fn().mockReturnValue("@codenhub/error@0.3.0"),
    });

    await buildPublishedSnapshot({ repoRoot, snapshotRoot }, deps);

    expect(deps.resolveLatestPublishedTag).toHaveBeenCalledWith("@codenhub/error", [
      "@codenhub/error@0.2.0",
      "@codenhub/error@0.3.0",
    ]);

    expect(JSON.parse(await readFile(snapshotReleasesPath(snapshotRoot), "utf8"))).toEqual({
      "@codenhub/error": [
        { date: "2026-10-09T00:00:00+00:00", isPrerelease: false, version: "0.3.0" },
        { date: "2026-08-01T00:00:00+00:00", isPrerelease: false, version: "0.2.0" },
      ],
    });
  });

  it("keeps the logo the released manifest declares", async () => {
    const repoRoot = await createTempDir();
    const snapshotRoot = await createTempDir();
    const manifest = { ...DOCS_MANIFEST, codenhub: { ...DOCS_MANIFEST.codenhub, logo: "assets/logo.svg" } };
    const deps = createDeps([createPackage(repoRoot, "packages/error", "@codenhub/error")], {
      materializeTreeAtRef: materializeFiles({
        "assets/logo.svg": "<svg/>",
        "assets/other.svg": "<svg/>",
        "package.json": JSON.stringify(manifest),
      }),
      resolveLatestPublishedTag: vi.fn().mockReturnValue("@codenhub/error@0.3.0"),
    });

    await buildPublishedSnapshot({ repoRoot, snapshotRoot }, deps);

    await expect(readdir(path.join(snapshotRoot, "packages/error/assets"))).resolves.toEqual(["logo.svg"]);
  });

  it("keeps whichever released packages the caller includes, metadata or not", async () => {
    const repoRoot = await createTempDir();
    const snapshotRoot = await createTempDir();
    const deps = createDeps([createPackage(repoRoot, "packages/router", "@codenhub/router")], {
      materializeTreeAtRef: materializeFiles({
        "package.json": JSON.stringify({ name: "@codenhub/router", private: false }),
      }),
      resolveLatestPublishedTag: vi.fn().mockReturnValue("@codenhub/router@0.0.2"),
    });

    await buildPublishedSnapshot(
      { includes: (manifest, metadata) => manifest.private === false && metadata === null, repoRoot, snapshotRoot },
      deps,
    );

    await expect(readdir(snapshotPackagesRoot(snapshotRoot))).resolves.toEqual(["router"]);
  });
});

describe("buildPublishedSnapshot logo", () => {
  it("fails the build when the released logo links outside the package", async (context) => {
    const repoRoot = await createTempDir();
    const snapshotRoot = await createTempDir();
    const outside = path.join(await createTempDir(), "secret.svg");
    await writeFile(outside, "<svg/>", "utf8");
    const manifest = { ...DOCS_MANIFEST, codenhub: { ...DOCS_MANIFEST.codenhub, logo: "logo.svg" } };
    let canLink = true;
    const deps = createDeps([createPackage(repoRoot, "packages/error", "@codenhub/error")], {
      materializeTreeAtRef: vi.fn(async ({ destination }: MaterializeTreeOptions) => {
        await mkdir(destination, { recursive: true });
        await writeFile(path.join(destination, "package.json"), JSON.stringify(manifest), "utf8");
        try {
          await symlink(outside, path.join(destination, "logo.svg"), "file");
        } catch {
          canLink = false;
        }
        return true;
      }),
      resolveLatestPublishedTag: vi.fn().mockReturnValue("@codenhub/error@0.3.0"),
    });

    const build = buildPublishedSnapshot({ repoRoot, snapshotRoot }, deps);
    if (!canLink) {
      await build.catch(() => undefined);
      // Creating a symlink needs a privilege Windows grants only in developer mode.
      context.skip();
    }
    await expect(build).rejects.toThrow('declares codenhub.logo "logo.svg"');
  });
});

describe("buildReleaseHistory", () => {
  it("leaves out a package with no release tag", async () => {
    const history = await buildReleaseHistory("/repo", {
      discoverWorkspace: vi.fn().mockResolvedValue({
        packages: [createPackage("/repo", "packages/error", "@codenhub/error")],
        root: "/repo",
      }),
      listTagDates: vi.fn().mockResolvedValue(new Map([["@codenhub/styles@0.7.0", "2026-10-01T00:00:00+00:00"]])),
    });

    expect(history).toEqual({});
  });
});
