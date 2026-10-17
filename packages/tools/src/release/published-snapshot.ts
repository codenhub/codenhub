import { lstat, mkdir, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { parsePackageMetadata, type PackageMetadata } from "../documentation/package-metadata.ts";
import { discoverWorkspace, type WorkspacePackage } from "../workspace/discover.ts";
import {
  collectReleases,
  fetchReleaseTags,
  listTagDates,
  resolveLatestPublishedTag,
  type PackageRelease,
} from "./published-tags.ts";
import { materializeTreeAtRef } from "./tag-content.ts";

/** Every released package's releases, newest first, keyed by package name. */
export type ReleaseHistory = Record<string, PackageRelease[]>;

/** Where the repository and the tag-scoped snapshot live. */
export interface PublishedSnapshotOptions {
  /** Absolute repository root, used to run `git` and resolve workspace packages. */
  repoRoot: string;
  /** Absolute directory the snapshot is written into. Cleared and rebuilt on every call. */
  snapshotRoot: string;
  /**
   * Which released packages the snapshot keeps, judged on the manifest at the
   * release tag and its metadata (`null` when it declares none). Defaults to
   * packages that declare `codenhub.docs`.
   */
  includes?: (manifest: Record<string, unknown>, metadata: PackageMetadata | null) => boolean;
}

/** Collaborators the snapshot builder calls through, injected by tests. */
export interface PublishedSnapshotDeps {
  discoverWorkspace: typeof discoverWorkspace;
  fetchReleaseTags: typeof fetchReleaseTags;
  listTagDates: typeof listTagDates;
  materializeTreeAtRef: typeof materializeTreeAtRef;
  resolveLatestPublishedTag: typeof resolveLatestPublishedTag;
}

// What the sites read from a package: the catalogs read the manifest and
// `docs/`, and resource publication validates the README and `llms` files and
// serves `LICENSE` and `NOTICE`. Public docs may link nowhere else
// (`invalid-docs-escape`), so nothing outside this set can be a link target.
// A declared `codenhub.logo` is kept as well, wherever it sits.
const ROOT_SURFACES = new Set(["LICENSE", "NOTICE", "README.md", "llms-full.txt", "llms.txt", "package.json"]);
const DOCS_DIRECTORY = "docs";

const RELEASES_FILE = "releases.json";

const defaultDeps: PublishedSnapshotDeps = {
  discoverWorkspace,
  fetchReleaseTags,
  listTagDates,
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

/**
 * Where the snapshot keeps the release history of every released package.
 * @param snapshotRoot Directory the snapshot is written into.
 * @returns Absolute path of the {@link ReleaseHistory} JSON file.
 */
export function snapshotReleasesPath(snapshotRoot: string): string {
  return path.join(snapshotRoot, RELEASES_FILE);
}

/**
 * Collects every workspace package's releases from the local release tags.
 *
 * Reads tags as they are; {@link buildPublishedSnapshot} fetches them first.
 * A package with no release tag has no entry.
 * @param repoRoot Absolute repository root.
 * @param deps Collaborators to call through, defaulting to the real filesystem and `git`.
 * @returns Releases keyed by package name.
 */
export async function buildReleaseHistory(
  repoRoot: string,
  deps: Pick<PublishedSnapshotDeps, "discoverWorkspace" | "listTagDates"> = defaultDeps,
): Promise<ReleaseHistory> {
  const [workspace, tagDates] = await Promise.all([deps.discoverWorkspace(repoRoot), deps.listTagDates(repoRoot)]);
  return Object.fromEntries(
    workspace.packages.flatMap((workspacePackage) => {
      const releases = collectReleases(workspacePackage.name, tagDates);
      return releases.length === 0 ? [] : [[workspacePackage.name, releases] as const];
    }),
  );
}

async function snapshotPackage(
  deps: PublishedSnapshotDeps,
  workspacePackage: WorkspacePackage,
  context: Required<PublishedSnapshotOptions> & { tags: readonly string[] },
): Promise<void> {
  const { includes, repoRoot, snapshotRoot, tags } = context;
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
  // a package opts into a site in the same release that ships what it shows.
  const metadata = parsePackageMetadata(manifest, `${workspacePackage.location}/package.json`);
  if (!includes(manifest as Record<string, unknown>, metadata)) {
    await rm(destination, { force: true, recursive: true });
    return;
  }
  const logo = metadata?.logo === undefined ? undefined : await readLogo(destination, metadata.logo, tag);
  await pruneToPublishedSurfaces(destination);
  if (logo !== undefined) {
    await mkdir(path.dirname(logo.path), { recursive: true });
    await writeFile(logo.path, logo.content);
  }
}

/**
 * Reads a released package's declared logo, refusing anything but a regular file inside the package.
 *
 * The snapshot is published, so a logo that is a symlink, or resolves outside
 * the package, would copy whatever it points at onto the site.
 * @param packageDirectory Materialized package directory.
 * @param logo Package-relative logo path from the released manifest.
 * @param tag Release tag, for the error message.
 * @returns The logo's bytes and where to write them back after pruning.
 * @throws When the logo is missing, not a regular file, or outside the package.
 */
async function readLogo(
  packageDirectory: string,
  logo: string,
  tag: string,
): Promise<{ content: Buffer; path: string }> {
  const logoPath = path.join(packageDirectory, logo);
  const entry = await lstat(logoPath).catch(() => undefined);
  const relativePath =
    entry?.isFile() === true ? path.relative(await realpath(packageDirectory), await realpath(logoPath)) : "..";
  if (relativePath === "" || path.isAbsolute(relativePath) || relativePath.split(path.sep)[0] === "..") {
    throw new Error(`${tag} declares codenhub.logo "${logo}", which is not a regular file in the package.`);
  }
  return { content: await readFile(logoPath), path: logoPath };
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
 * Materializes every released, documentation-enabled package as of its latest release tag,
 * with the release history of every released package beside it.
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
export async function buildPublishedSnapshot(
  options: PublishedSnapshotOptions,
  deps: PublishedSnapshotDeps = defaultDeps,
): Promise<void> {
  const { repoRoot, snapshotRoot } = options;
  const includes = options.includes ?? ((_manifest, metadata) => metadata?.documented === true);
  await rm(snapshotRoot, { force: true, recursive: true });
  // Created even when nothing has released, so every reader of the snapshot
  // finds an empty tree rather than a missing one.
  await mkdir(snapshotPackagesRoot(snapshotRoot), { recursive: true });

  // A failed fetch can leave local tags stale or entirely absent, which would
  // drop released packages from the site or pin them to an older release.
  if (!(await deps.fetchReleaseTags(repoRoot))) {
    throw new Error(`Could not fetch release tags from origin in ${repoRoot}.`);
  }
  const [workspace, tagDates] = await Promise.all([deps.discoverWorkspace(repoRoot), deps.listTagDates(repoRoot)]);
  const tags = [...tagDates.keys()];

  await Promise.all(
    workspace.packages.map((workspacePackage) =>
      snapshotPackage(deps, workspacePackage, { includes, repoRoot, snapshotRoot, tags }),
    ),
  );
  const history = await buildReleaseHistory(repoRoot, {
    discoverWorkspace: async () => workspace,
    listTagDates: async () => tagDates,
  });
  await writeFile(snapshotReleasesPath(snapshotRoot), `${JSON.stringify(history, undefined, 2)}\n`, "utf8");
}
