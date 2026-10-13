import { copyFile, lstat, mkdir, readdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";

import type { WorkspacePackage } from "../workspace/discover.ts";
import { isValidRelativeAssetPath, parseAssetEntries } from "./manifest.ts";

const ASSETS_DIRECTORY = "assets";
const MANIFEST_LOCATION = "package.json";

/** Name of the gitignored file a package's asset placements are tracked in. */
export const ASSET_STATE_FILE = ".codenhub-assets.json";

interface AssetState {
  placed?: unknown;
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function isWithin(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);
  return (
    relativePath === "" || (!isAbsolute(relativePath) && relativePath !== ".." && !relativePath.startsWith(`..${sep}`))
  );
}

async function assertNoSymbolicLink(packageDirectory: string, destination: string): Promise<void> {
  const relativeDestination = relative(packageDirectory, destination);
  let current = packageDirectory;
  const paths = relativeDestination.split(sep).map((segment) => {
    current = join(current, segment);
    return current;
  });
  await Promise.all(
    paths.map(async (path) => {
      try {
        if ((await lstat(path)).isSymbolicLink()) {
          throw new Error(`Refusing to place an asset through symbolic link ${path}.`);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return;
        }
        throw error;
      }
    }),
  );
}

async function readPlaced(packageDirectory: string): Promise<string[]> {
  try {
    const raw = JSON.parse(await readFile(join(packageDirectory, ASSET_STATE_FILE), "utf8")) as AssetState;
    // Validated the same as a manifest's own `to`: cleanup below joins these
    // straight onto `packageDirectory` and deletes the result, so a corrupted
    // or hand-edited state file must not be able to smuggle a traversal path in.
    return Array.isArray(raw.placed)
      ? raw.placed.filter((entry): entry is string => typeof entry === "string" && isValidRelativeAssetPath(entry))
      : [];
  } catch {
    return [];
  }
}

/**
 * Reports whether an existing destination is the file the sync placed under another letter case.
 *
 * On a case-insensitive file system `public/Logo.svg` and a placed `public/logo.svg` are one file,
 * so the name on disk decides: the file is the sync's own only when its exact on-disk name is the
 * placed name. A `Logo.svg` that really exists beside a placed `logo.svg` is refused. Directory
 * segments must match exactly, since a directory's letter case is not changed by copying into it.
 * @param destination Absolute path the manifest declares.
 * @param to The declared destination, relative to the package directory.
 * @param placed Destinations recorded by the previous run.
 * @returns `true` when the existing file is a placed destination under a different letter case.
 */
async function isPlacedUnderOtherCase(destination: string, to: string, placed: string[]): Promise<boolean> {
  const name = basename(destination);
  const names = await readdir(dirname(destination));
  const onDiskName = names.includes(name)
    ? name
    : names.find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return (
    onDiskName !== undefined &&
    placed.some(
      (destinationPlaced) => dirname(destinationPlaced) === dirname(to) && basename(destinationPlaced) === onDiskName,
    )
  );
}

/**
 * Reports whether a package declares any `codenhub.assets` entry.
 * @param workspacePackage Package to inspect.
 * @returns `true` when the manifest declares at least one entry.
 */
export function declaresAssets(workspacePackage: WorkspacePackage): boolean {
  const manifestPath = join(workspacePackage.directory, MANIFEST_LOCATION);
  return parseAssetEntries(workspacePackage.manifest, manifestPath).length > 0;
}

/** What one sync run did for a package. */
export interface AssetSyncResult {
  /** Destinations copied this run, relative to the package directory. */
  copied: string[];
  /** Previously placed destinations removed because they are no longer declared. */
  removed: string[];
}

/**
 * Places a package's declared `codenhub.assets` and removes what it no longer declares.
 *
 * This is the one place root `assets/` gets copied from — every consumer reuses it
 * rather than each carrying its own copy step, which is how the source stays the
 * only place the files are committed and every destination stays current with it.
 * Placement itself is untouched: `to` is read verbatim from the package's own
 * manifest, never derived or assumed here.
 *
 * A destination is remembered in {@link ASSET_STATE_FILE} so a later run can tell
 * a file it placed apart from one it never touched — that is what lets a removed
 * entry's old file be deleted without risking anything this mechanism did not
 * itself place.
 * @param workspacePackage Package to sync.
 * @param root Absolute repository root.
 * @returns What was copied and removed.
 * @throws When a declared `from` does not resolve to a real file under `assets/`.
 */
export async function syncPackageAssets(workspacePackage: WorkspacePackage, root: string): Promise<AssetSyncResult> {
  const manifestPath = join(workspacePackage.directory, MANIFEST_LOCATION);
  const entries = parseAssetEntries(workspacePackage.manifest, manifestPath);
  const assetsRoot = join(root, ASSETS_DIRECTORY);
  const resolvedAssetsRoot = await realpath(assetsRoot);
  const declared = [...new Set(entries.map((entry) => entry.to))];

  const previouslyPlaced = await readPlaced(workspacePackage.directory);
  const previouslyPlacedSet = new Set(previouslyPlaced);
  const removed = previouslyPlaced.filter((destination) => !declared.includes(destination));

  const preparedEntries = await Promise.all(
    entries.map(async (entry) => {
      const source = join(assetsRoot, entry.from);
      if (!(await isFile(source))) {
        throw new Error(
          `${workspacePackage.name} declares codenhub.assets "${entry.from}", which does not exist under ${ASSETS_DIRECTORY}/.`,
        );
      }
      const resolvedSource = await realpath(source);
      if (!isWithin(resolvedAssetsRoot, resolvedSource)) {
        throw new Error(
          `${workspacePackage.name} declares codenhub.assets "${entry.from}", which resolves outside ${ASSETS_DIRECTORY}/.`,
        );
      }

      const destination = join(workspacePackage.directory, entry.to);
      await assertNoSymbolicLink(workspacePackage.directory, destination);
      if (
        !previouslyPlacedSet.has(entry.to) &&
        (await pathExists(destination)) &&
        !(await isPlacedUnderOtherCase(destination, entry.to, previouslyPlaced))
      ) {
        throw new Error(
          `${workspacePackage.name} declares codenhub.assets destination "${entry.to}", but the asset sync did not place the existing path.`,
        );
      }
      return { destination, source: resolvedSource, to: entry.to };
    }),
  );

  await Promise.all(
    removed.map(async (destination) =>
      assertNoSymbolicLink(workspacePackage.directory, join(workspacePackage.directory, destination)),
    ),
  );
  // Every removal and copy settles before the state is written, so the state describes what is
  // on disk even when one of them fails. The first failure is rethrown after that.
  const removals = await Promise.allSettled(
    removed.map(async (destination) => rm(join(workspacePackage.directory, destination), { force: true })),
  );
  const copies = await Promise.allSettled(
    preparedEntries.map(async ({ destination, source }) => {
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(source, destination);
    }),
  );

  // Still declared and previously placed stays recorded even when its rewrite failed: the file on
  // disk is still the one the sync placed. A removal that failed keeps its file, so it stays recorded too.
  const declaredSet = new Set(declared);
  const placed = new Set(previouslyPlaced.filter((destination) => declaredSet.has(destination)));
  preparedEntries.forEach(({ to }, index) => {
    if (copies[index].status === "fulfilled") {
      placed.add(to);
    }
  });
  removed.forEach((destination, index) => {
    if (removals[index].status === "rejected") {
      placed.add(destination);
    }
  });

  const stateFile = join(workspacePackage.directory, ASSET_STATE_FILE);
  if (placed.size === 0) {
    await rm(stateFile, { force: true });
  } else {
    await writeFile(stateFile, `${JSON.stringify({ placed: [...placed].toSorted() }, null, 2)}\n`);
  }

  const failure = [...removals, ...copies].find((result) => result.status === "rejected");
  if (failure !== undefined) {
    throw failure.reason;
  }

  return { copied: declared, removed };
}
