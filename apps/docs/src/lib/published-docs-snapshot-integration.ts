import type { AstroIntegration } from "astro";

import { buildPublishedDocsSnapshot, type PublishedDocsSnapshotOptions } from "./published-docs-snapshot";

interface IntegrationOptions extends PublishedDocsSnapshotOptions {
  build?: (options: PublishedDocsSnapshotOptions) => Promise<void>;
}

/**
 * Populates the tag-scoped documentation snapshot before a production build.
 *
 * Only `astro build` runs this. `astro dev` keeps `catalog.ts` reading
 * `packages/*\/docs` live, so editing a package's docs during local authoring
 * still hot-reloads; `import.meta.env.PROD` is the same signal `catalog.ts`
 * uses to choose between the live and snapshot glob roots, so the two stay in
 * step without this integration reaching into that module directly.
 * @param options Where the repository and the snapshot live, and the builder to run.
 * @returns Astro integration to register in `astro.config.ts`.
 */
export function createPublishedDocsSnapshotIntegration(options: IntegrationOptions): AstroIntegration {
  const build = options.build ?? buildPublishedDocsSnapshot;
  return {
    name: "codenhub-published-docs-snapshot",
    hooks: {
      "astro:config:setup": async ({ command }) => {
        if (command !== "build") {
          return;
        }
        await build({ repoRoot: options.repoRoot, snapshotRoot: options.snapshotRoot });
      },
    },
  };
}
