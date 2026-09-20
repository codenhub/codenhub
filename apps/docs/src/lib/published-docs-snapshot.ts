import { existsSync } from "node:fs";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  fetchReleaseTags,
  listFilesAtRef,
  listTags,
  readFileAtRef,
  resolveLatestPublishedTag,
} from "@codenhub/tools/release";
import { discoverWorkspace, type WorkspacePackage } from "@codenhub/tools/workspace";

/** Where the repository and the tag-scoped snapshot live. */
export interface PublishedDocsSnapshotOptions {
  /** Absolute repository root, used to run `git` and resolve workspace packages. */
  repoRoot: string;
  /** Absolute directory the snapshot is written into. Cleared and rebuilt on every call. */
  snapshotRoot: string;
}

/** Collaborators the snapshot builder calls through, injected by tests. */
export interface PublishedDocsSnapshotDeps {
  discoverWorkspace: typeof discoverWorkspace;
  fetchReleaseTags: typeof fetchReleaseTags;
  listFilesAtRef: typeof listFilesAtRef;
  listTags: typeof listTags;
  readFileAtRef: typeof readFileAtRef;
  resolveLatestPublishedTag: typeof resolveLatestPublishedTag;
}

const defaultDeps: PublishedDocsSnapshotDeps = {
  discoverWorkspace,
  fetchReleaseTags,
  listFilesAtRef,
  listTags,
  readFileAtRef,
  resolveLatestPublishedTag,
};

function toPosix(value: string): string {
  return value.replaceAll("\\", "/");
}

function isInternal(relativePath: string): boolean {
  return toPosix(relativePath).split("/")[0] === "internal";
}

async function snapshotDocsFromTag(
  deps: PublishedDocsSnapshotDeps,
  repoRoot: string,
  tag: string,
  workspacePackage: WorkspacePackage,
  destinationDocs: string,
): Promise<boolean> {
  const docsPath = toPosix(`${workspacePackage.location}/docs`);
  const files = (await deps.listFilesAtRef(repoRoot, tag, docsPath)).filter(
    (filePath) => !isInternal(filePath.slice(docsPath.length + 1)),
  );
  if (files.length === 0) {
    // The package published before it had docs, or before this file existed at
    // that tag. There is nothing published to show, so this falls back to live
    // content the same way a package with no tag at all does.
    return false;
  }
  await Promise.all(
    files.map(async (filePath) => {
      const content = await deps.readFileAtRef(repoRoot, tag, filePath);
      if (content === undefined) {
        return;
      }
      const destinationPath = path.join(destinationDocs, ...filePath.slice(docsPath.length + 1).split("/"));
      await mkdir(path.dirname(destinationPath), { recursive: true });
      await writeFile(destinationPath, content, "utf8");
    }),
  );
  return true;
}

async function snapshotDocsFromWorkingTree(workspacePackage: WorkspacePackage, destinationDocs: string): Promise<void> {
  const sourceDocs = path.join(workspacePackage.directory, "docs");
  await cp(sourceDocs, destinationDocs, {
    filter: (source) => !isInternal(path.relative(sourceDocs, source)),
    recursive: true,
  });
}

async function snapshotPackage(
  deps: PublishedDocsSnapshotDeps,
  workspacePackage: WorkspacePackage,
  context: { repoRoot: string; snapshotRoot: string; tags: readonly string[] },
): Promise<void> {
  const { repoRoot, snapshotRoot, tags } = context;
  const destinationRoot = path.join(snapshotRoot, workspacePackage.location);
  const destinationDocs = path.join(destinationRoot, "docs");

  await mkdir(destinationRoot, { recursive: true });
  // The manifest travels live, unpinned: only documentation prose is scoped to
  // a release, since `buildPackageDefinitions` correlates it against a
  // manifest path sharing this same snapshot root.
  await cp(path.join(workspacePackage.directory, "package.json"), path.join(destinationRoot, "package.json"));

  const tag = deps.resolveLatestPublishedTag(workspacePackage.name, tags);
  const publishedFromTag =
    tag === undefined ? false : await snapshotDocsFromTag(deps, repoRoot, tag, workspacePackage, destinationDocs);
  if (!publishedFromTag) {
    await snapshotDocsFromWorkingTree(workspacePackage, destinationDocs);
  }
}

/**
 * Materializes each package's `docs/` as of its latest published release tag.
 *
 * A build that reads `packages/*\/docs` straight from the working tree shows
 * whatever happens to sit on `main`, which can describe behavior that has not
 * reached npm yet — the more packages are in flight together, the more this
 * shows. This writes a parallel tree the site reads instead: each package's
 * `docs/` comes from `git show <tag>:...` at that package's own newest
 * `<name>@<version>` tag, resolved by `@codenhub/tools/release`. A package
 * with no tag yet, or whose docs did not exist yet at its latest tag, falls
 * back to its live `docs/` — there is nothing published to gate it against.
 * @param options Where the repository and the snapshot live.
 * @param deps Collaborators to call through, defaulting to the real filesystem and `git`.
 */
export async function buildPublishedDocsSnapshot(
  options: PublishedDocsSnapshotOptions,
  deps: PublishedDocsSnapshotDeps = defaultDeps,
): Promise<void> {
  const { repoRoot, snapshotRoot } = options;
  await rm(snapshotRoot, { force: true, recursive: true });

  const workspace = await deps.discoverWorkspace(repoRoot);
  const documented = workspace.packages.filter((workspacePackage) =>
    existsSync(path.join(workspacePackage.directory, "docs")),
  );
  if (documented.length === 0) {
    return;
  }

  await deps.fetchReleaseTags(repoRoot);
  const tags = await deps.listTags(repoRoot);

  await Promise.all(
    documented.map((workspacePackage) => snapshotPackage(deps, workspacePackage, { repoRoot, snapshotRoot, tags })),
  );
}
