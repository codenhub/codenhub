import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { parsePackageMetadata } from "@codenhub/tools/documentation";
import {
  buildPublishedSnapshot,
  buildReleaseHistory,
  snapshotReleasesPath,
  type PublishedSnapshotOptions,
} from "@codenhub/tools/release";
import { discoverWorkspace } from "@codenhub/tools/workspace";
import type { AstroIntegration } from "astro";

interface IntegrationOptions extends PublishedSnapshotOptions {
  /** Absolute directory declared logos are copied into, served as `/logos/<slug>.svg`. */
  logosRoot: string;
}

/**
 * Whether an Astro run reads packages from the published snapshot rather than the working tree.
 *
 * Mirrors `import.meta.env.PROD`, which `catalog.ts` chooses its glob roots on;
 * `apps/docs/src/lib/published-docs-snapshot-integration.ts` explains why the
 * command alone is not the same signal.
 * @param command Astro command of the current run.
 * @returns Whether the catalog reads the snapshot.
 */
export function readsPublishedSnapshot(command: string): boolean {
  return command === "build" && process.env.NODE_ENV === "production";
}

/**
 * Copies each package's declared `codenhub.logo` to `<logosRoot>/<slug>.svg`.
 *
 * The site links logos by slug rather than globbing them, because a glob wide
 * enough to find a logo anywhere in a package would emit every SVG in the
 * workspace into the build.
 * @param repoRoot Absolute repository root, used to find package locations.
 * @param packagesBase Directory package locations resolve against: the repository, or the snapshot.
 * @param logosRoot Directory the logos are written into. Cleared first.
 */
async function copyLogos(repoRoot: string, packagesBase: string, logosRoot: string): Promise<void> {
  await rm(logosRoot, { force: true, recursive: true });
  await mkdir(logosRoot, { recursive: true });
  const workspace = await discoverWorkspace(repoRoot);
  await Promise.all(
    workspace.packages.map(async ({ location }) => {
      const manifestPath = path.join(packagesBase, location, "package.json");
      const manifest = await readFile(manifestPath, "utf8").then(JSON.parse, () => undefined);
      if (manifest === undefined) {
        return;
      }
      const metadata = parsePackageMetadata(manifest, manifestPath);
      if (metadata?.logo !== undefined) {
        await copyFile(path.join(packagesBase, location, metadata.logo), path.join(logosRoot, `${metadata.slug}.svg`));
      }
    }),
  );
}

/**
 * Chooses which released packages the index snapshot keeps.
 *
 * Every released public package, not only documented ones: a release cut
 * before `codenhub` metadata existed still belongs in the index
 * (docs/specs/packages-metadata.md, "Pre-migration manifests"). Such a tag
 * cannot say `listed: false`, so for it alone the working tree's `listed`
 * decides; a package unlisted there stays out until a release says otherwise.
 * @param repoRoot Absolute repository root.
 * @returns The snapshot's `includes` predicate.
 */
async function createIncludes(repoRoot: string): Promise<NonNullable<PublishedSnapshotOptions["includes"]>> {
  const workspace = await discoverWorkspace(repoRoot);
  const unlisted = new Set(
    workspace.packages
      .filter(({ location, manifest }) => parsePackageMetadata(manifest, `${location}/package.json`)?.listed === false)
      .map(({ name }) => name),
  );
  return (manifest, metadata) =>
    manifest.private === false && (metadata !== null || !unlisted.has(manifest.name as string));
}

/**
 * Prepares what `catalog.ts` reads before Vite scans its globs.
 *
 * A production build writes the tag-scoped snapshot, with its release history,
 * and copies logos from it. Any other run reads the working tree, so it only
 * records release history from the local tags, without fetching, and copies
 * logos from the working tree.
 * @param options Where the repository, the snapshot, and the logos live.
 * @returns Astro integration to register in `astro.config.ts`.
 */
export function createReleaseSnapshotIntegration(options: IntegrationOptions): AstroIntegration {
  const { logosRoot, repoRoot, snapshotRoot } = options;
  return {
    name: "codenhub-release-snapshot",
    hooks: {
      "astro:config:setup": async ({ command }) => {
        if (readsPublishedSnapshot(command)) {
          await buildPublishedSnapshot({ includes: await createIncludes(repoRoot), repoRoot, snapshotRoot });
          await copyLogos(repoRoot, snapshotRoot, logosRoot);
          return;
        }
        await rm(snapshotRoot, { force: true, recursive: true });
        await mkdir(snapshotRoot, { recursive: true });
        const history = await buildReleaseHistory(repoRoot);
        await writeFile(snapshotReleasesPath(snapshotRoot), `${JSON.stringify(history, undefined, 2)}\n`, "utf8");
        await copyLogos(repoRoot, repoRoot, logosRoot);
      },
    },
  };
}
