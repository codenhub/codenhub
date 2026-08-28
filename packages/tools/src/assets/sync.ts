import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

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
  const declared = [...new Set(entries.map((entry) => entry.to))];

  const previouslyPlaced = await readPlaced(workspacePackage.directory);
  const removed = previouslyPlaced.filter((destination) => !declared.includes(destination));
  await Promise.all(
    removed.map(async (destination) => rm(join(workspacePackage.directory, destination), { force: true })),
  );

  await Promise.all(
    entries.map(async (entry) => {
      const source = join(assetsRoot, entry.from);
      if (!(await isFile(source))) {
        throw new Error(
          `${workspacePackage.name} declares codenhub.assets "${entry.from}", which does not exist under ${ASSETS_DIRECTORY}/.`,
        );
      }
      const destination = join(workspacePackage.directory, entry.to);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(source, destination);
    }),
  );

  const stateFile = join(workspacePackage.directory, ASSET_STATE_FILE);
  if (declared.length === 0) {
    await rm(stateFile, { force: true });
  } else {
    await writeFile(stateFile, `${JSON.stringify({ placed: declared.toSorted() }, null, 2)}\n`);
  }

  return { copied: declared, removed };
}
