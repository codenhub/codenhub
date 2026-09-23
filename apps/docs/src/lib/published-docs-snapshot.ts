import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

import { parsePackageMetadata } from "@codenhub/tools/documentation";
import { fetchReleaseTags, listTags, materializeTreeAtRef, resolveLatestPublishedTag } from "@codenhub/tools/release";
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
  listTags: typeof listTags;
  materializeTreeAtRef: typeof materializeTreeAtRef;
  resolveLatestPublishedTag: typeof resolveLatestPublishedTag;
}

// What the site reads from a package: the catalog reads the manifest and
// `docs/`, and resource publication validates the README and `llms` files and
// serves `LICENSE` and `NOTICE`. Public docs may link nowhere else
// (`invalid-docs-escape`), so nothing outside this set can be a link target.
const ROOT_SURFACES = new Set(["LICENSE", "NOTICE", "README.md", "llms-full.txt", "llms.txt", "package.json"]);
const DOCS_DIRECTORY = "docs";

const defaultDeps: PublishedDocsSnapshotDeps = {
  discoverWorkspace,
  fetchReleaseTags,
  listTags,
  materializeTreeAtRef,
  resolveLatestPublishedTag,
};

/**
 * Where the snapshot keeps its packages, mirroring the repository's own `packages/`.
 * @param snapshotRoot Directory the snapshot is written into.
 * @returns Absolute directory to read snapshotted packages from.
 */
export function snapshotPackagesRoot(snapshotRoot: string): string {
  return path.join(snapshotRoot, "packages");
}

async function snapshotPackage(
  deps: PublishedDocsSnapshotDeps,
  workspacePackage: WorkspacePackage,
  context: { repoRoot: string; snapshotRoot: string; tags: readonly string[] },
): Promise<void> {
  const { repoRoot, snapshotRoot, tags } = context;
  const tag = deps.resolveLatestPublishedTag(workspacePackage.name, tags);
  if (tag === undefined) {
    // No tag means no release, so there is nothing published to show. The
    // working tree is never a fallback: it is exactly the unreleased content
    // this snapshot exists to keep off the site.
    return;
  }

  const destination = path.join(snapshotRoot, workspacePackage.location);
  const isFound = await deps.materializeTreeAtRef({
    cwd: repoRoot,
    destination,
    ref: tag,
    treePath: workspacePackage.location,
  });
  if (!isFound) {
    throw new Error(
      `${tag} has nothing at ${workspacePackage.location}; the package moved after its last release. Release it from its new location to publish its docs again.`,
    );
  }

  const manifestPath = path.join(destination, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
  const name = typeof manifest === "object" && manifest !== null ? (manifest as { name?: unknown }).name : undefined;
  if (name !== workspacePackage.name) {
    throw new Error(`${tag} has ${String(name)} at ${workspacePackage.location}, not ${workspacePackage.name}.`);
  }
  // The opt-in is read from the released manifest, like everything else here:
  // a package opts into the site in the same release that ships its docs.
  if (parsePackageMetadata(manifest, `${workspacePackage.location}/package.json`) === null) {
    await rm(destination, { force: true, recursive: true });
    return;
  }
  await pruneToPublishedSurfaces(destination);
}

/**
 * Removes everything the site does not publish or validate from a materialized package.
 *
 * Source, tests, and configs have no business in a content tree that sits
 * inside this app: Vitest would collect the package's tests, `tsc` would check
 * its sources, and Vite would compile its Markdown against the package's own
 * `tsconfig.json`, whose `extends` target is not here.
 * @param packageDirectory Materialized package directory.
 */
async function pruneToPublishedSurfaces(packageDirectory: string): Promise<void> {
  const entries = await readdir(packageDirectory);
  await Promise.all(
    entries
      .filter((entry) => entry !== DOCS_DIRECTORY && !ROOT_SURFACES.has(entry))
      .map((entry) => rm(path.join(packageDirectory, entry), { force: true, recursive: true })),
  );
  await rm(path.join(packageDirectory, DOCS_DIRECTORY, "internal"), { force: true, recursive: true });
}

/**
 * Materializes every released, documentation-enabled package as of its latest release tag.
 *
 * A build that reads `packages/*` straight from the working tree shows whatever
 * happens to sit on `main`, which can describe behavior that has not reached npm
 * yet. This writes a parallel `packages/` tree the site reads instead, in which
 * each package is its whole directory at its own newest `<name>@<version>` tag,
 * resolved by `@codenhub/tools/release`. Everything the site publishes about a
 * package — its manifest, its `docs/`, its `LICENSE`, `NOTICE`, and assets —
 * therefore comes from the same release.
 *
 * A package appears only when it has a release tag and its manifest at that tag
 * declares `codenhub.docs`. A package with no tag is absent: there is no
 * fallback to the working tree, because falling back is how unreleased
 * documentation reached the site before.
 *
 * A git operation that fails outright — an unreadable tag, a failed tag fetch,
 * a package no longer where its tag put it — throws rather than dropping the
 * package. A published package missing from the site is a failure to report,
 * not a state to ship.
 * @param options Where the repository and the snapshot live.
 * @param deps Collaborators to call through, defaulting to the real filesystem and `git`.
 * @throws When tags cannot be fetched, a tag cannot be read, or a package's location or name at its tag disagrees with the workspace.
 */
export async function buildPublishedDocsSnapshot(
  options: PublishedDocsSnapshotOptions,
  deps: PublishedDocsSnapshotDeps = defaultDeps,
): Promise<void> {
  const { repoRoot, snapshotRoot } = options;
  await rm(snapshotRoot, { force: true, recursive: true });
  // Created even when nothing has released, so every reader of the snapshot
  // finds an empty tree rather than a missing one.
  await mkdir(snapshotPackagesRoot(snapshotRoot), { recursive: true });

  // A failed fetch can leave local tags stale or entirely absent, which would
  // drop released packages from the site or pin them to an older release.
  if (!(await deps.fetchReleaseTags(repoRoot))) {
    throw new Error(`Could not fetch release tags from origin in ${repoRoot}.`);
  }
  const [workspace, tags] = await Promise.all([deps.discoverWorkspace(repoRoot), deps.listTags(repoRoot)]);

  await Promise.all(
    workspace.packages.map((workspacePackage) =>
      snapshotPackage(deps, workspacePackage, { repoRoot, snapshotRoot, tags }),
    ),
  );
}
