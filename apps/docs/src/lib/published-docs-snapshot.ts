import { existsSync } from "node:fs";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { parsePackageMetadata } from "@codenhub/tools/documentation";
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
  // A `ref` git cannot read throws (see listFilesAtRef); zero matches is a
  // legitimate result of a valid read and is filtered further below.
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
      // This path was just listed at this same ref, so a read failure here is
      // an operational error, not "the file does not exist" — treating it as
      // the latter would silently ship an incomplete release, or worse, let a
      // later live-fallback show unreleased content in its place.
      const content = await deps.readFileAtRef(repoRoot, tag, filePath);
      if (content === undefined) {
        throw new Error(`${filePath} was listed at ${tag} but could not be read.`);
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
  if (!existsSync(sourceDocs)) {
    // Nothing published and nothing live either. Leaving no docs/ here surfaces
    // through `buildPackageDefinitions`' own "missing docs/index.md" check with
    // a clearer message than a raw ENOENT from the copy below would.
    return;
  }
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
  // The manifest travels live, unpinned: only documentation content is scoped
  // to a release, since `buildPackageDefinitions` correlates it against a
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
 *
 * This does not yet cover every public-facing surface: `LICENSE`, `NOTICE`,
 * and non-Markdown `docs/` assets still reach the site from the live tree
 * through `documentation-integration.ts`'s separate resource pipeline, which
 * also validates each package's npm pack contents and needs more than this
 * snapshot builds to run against a tag safely. Deferred for the same reason
 * `apps/demo` is: matching it would mean materializing a full historical
 * package build, not just copying files.
 *
 * A git operation that fails outright — an unreadable tag, a listed file that
 * cannot be read, a failed tag fetch — throws rather than falling back. Empty
 * results are only ever a legitimate "nothing here"; a failure treated the
 * same way would show unreleased content for a package that has, in fact,
 * published, which defeats the entire point of this function.
 * @param options Where the repository and the snapshot live.
 * @param deps Collaborators to call through, defaulting to the real filesystem and `git`.
 * @throws When a package's latest tag, or a file it lists, cannot be read, or when fetching tags fails.
 */
export async function buildPublishedDocsSnapshot(
  options: PublishedDocsSnapshotOptions,
  deps: PublishedDocsSnapshotDeps = defaultDeps,
): Promise<void> {
  const { repoRoot, snapshotRoot } = options;
  await rm(snapshotRoot, { force: true, recursive: true });

  const workspace = await deps.discoverWorkspace(repoRoot);
  // Eligibility is "opted into public docs" (the same `codenhub.docs` check
  // `buildPackageDefinitions` applies), not "currently has a docs/ directory
  // on disk". A package whose live docs/ was removed but that still has a
  // published tag with docs must still resolve that tag, not be filtered out
  // before it gets the chance.
  const documented = workspace.packages.filter(
    (workspacePackage) =>
      parsePackageMetadata(workspacePackage.manifest, `${workspacePackage.location}/package.json`) !== null,
  );
  if (documented.length === 0) {
    return;
  }

  // A failed fetch can leave local tags stale or entirely absent. Continuing
  // with whatever happens to be on disk would resolve every package as
  // unpublished and show live, unreleased content in its place — the exact
  // outcome this mechanism exists to prevent — so this fails the build instead
  // of guessing.
  if (!(await deps.fetchReleaseTags(repoRoot))) {
    throw new Error(`Could not fetch release tags from origin in ${repoRoot}.`);
  }
  const tags = await deps.listTags(repoRoot);

  await Promise.all(
    documented.map((workspacePackage) => snapshotPackage(deps, workspacePackage, { repoRoot, snapshotRoot, tags })),
  );
}
