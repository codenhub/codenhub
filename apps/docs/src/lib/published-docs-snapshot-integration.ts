import type { AstroIntegration } from "astro";

import { buildPublishedDocsSnapshot, type PublishedDocsSnapshotOptions } from "./published-docs-snapshot";

interface IntegrationOptions extends PublishedDocsSnapshotOptions {
  build?: (options: PublishedDocsSnapshotOptions) => Promise<void>;
}

/**
 * Whether an Astro run reads packages from the published snapshot rather than the working tree.
 *
 * This mirrors `import.meta.env.PROD`, which `catalog.ts` switches its glob
 * roots on and which config-time code cannot read: Vite derives it from
 * `NODE_ENV === "production"`, and `astro build` sets that when nothing else
 * has. The command alone is not the same signal — a build started from Vitest
 * runs with `NODE_ENV=test`, so its pages come from the working tree, and the
 * snapshot and resources must follow them there.
 * @param command Astro command of the current run.
 * @returns Whether pages, and so everything published alongside them, come from the snapshot.
 */
export function readsPublishedSnapshot(command: string): boolean {
  return command === "build" && process.env.NODE_ENV === "production";
}

/**
 * Populates the tag-scoped documentation snapshot before a production build.
 *
 * `astro dev` keeps `catalog.ts` reading `packages/*` live, so editing a
 * package's docs during local authoring still hot-reloads.
 * {@link readsPublishedSnapshot} decides, so this stays in step with the
 * catalog's glob roots without reaching into that module.
 * @param options Where the repository and the snapshot live, and the builder to run.
 * @returns Astro integration to register in `astro.config.ts`.
 */
export function createPublishedDocsSnapshotIntegration(options: IntegrationOptions): AstroIntegration {
  const build = options.build ?? buildPublishedDocsSnapshot;
  return {
    name: "codenhub-published-docs-snapshot",
    hooks: {
      "astro:config:setup": async ({ command }) => {
        if (!readsPublishedSnapshot(command)) {
          return;
        }
        await build({ repoRoot: options.repoRoot, snapshotRoot: options.snapshotRoot });
      },
    },
  };
}
