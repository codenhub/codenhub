import { readFile } from "node:fs/promises";
import path from "node:path";

import { discoverPublicResources, listPackageFiles, type PublicResource } from "@codenhub/tools/documentation";
import { snapshotArchivedRoot, snapshotDocsVersionsPath, type SnapshotDocsVersionsFile } from "@codenhub/tools/release";

/** What publishing archived versions' resources found, and what it left out. */
export interface ArchivedResources {
  resources: PublicResource[];
  /** One message per archived version whose resources could not be listed, which publishes none. */
  warnings: string[];
}

/**
 * Lists the resources of every archived version in a snapshot, each under its version's route.
 *
 * Archived content is published as written, without the documentation checks
 * (`docs/specs/packages-docs-versions.md`, "Building archived versions"), so a
 * version whose files cannot be listed or that collide is left out with a
 * warning rather than failing the build. A snapshot without
 * `docs-versions.json` has no archived versions.
 * @param snapshotRoot The published-docs snapshot directory.
 * @returns The resources and a warning per version left out.
 * @throws When `docs-versions.json` exists but cannot be parsed.
 */
export async function loadArchivedResources(snapshotRoot: string): Promise<ArchivedResources> {
  let file: SnapshotDocsVersionsFile;
  try {
    file = JSON.parse(await readFile(snapshotDocsVersionsPath(snapshotRoot), "utf8")) as SnapshotDocsVersionsFile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { resources: [], warnings: [] };
    }
    throw error;
  }
  const outcomes = await Promise.all(
    Object.entries(file).flatMap(([name, entry]) =>
      entry.archived.map(async (version) => {
        const rootPath = path.join(snapshotArchivedRoot(snapshotRoot), ...entry.location.split("/"), version);
        try {
          const files = await listPackageFiles(rootPath);
          const resources = discoverPublicResources(`${entry.slug}/${version}`, files).map((resource) => ({
            ...resource,
            rootPath,
          }));
          return { resources };
        } catch (error) {
          return { warning: `Left out the archived resources of ${name}@${version}: ${(error as Error).message}` };
        }
      }),
    ),
  );
  return {
    resources: outcomes.flatMap((outcome) => outcome.resources ?? []),
    warnings: outcomes.flatMap((outcome) => (outcome.warning === undefined ? [] : [outcome.warning])),
  };
}
