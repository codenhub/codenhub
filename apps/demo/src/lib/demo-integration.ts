import { cpSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { AstroIntegration } from "astro";

interface BuiltDemo {
  distPath: string;
  slug: string;
}

interface IntegrationOptions {
  discoverBuiltDemos?: (packagesRoot: string) => BuiltDemo[];
  packagesRoot: string;
}

/**
 * Discovers every `packages/*\/demo/package.json`, the same directory role
 * `apps/demo/src/lib/catalog.ts` discovers for the shell's own pages. This
 * runs as plain Node during the `astro:build:done` hook rather than through
 * `import.meta.glob`, because `distPath` must stay an absolute filesystem
 * path that survives Vite bundling the rest of this module into `dist/`.
 */
export function discoverBuiltDemos(packagesRoot: string): BuiltDemo[] {
  return readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((slug) => existsSync(path.join(packagesRoot, slug, "demo", "package.json")))
    .map((slug) => ({ distPath: path.join(packagesRoot, slug, "demo", "dist"), slug }))
    .sort((left, right) => left.slug.localeCompare(right.slug));
}

/**
 * Mounts every discovered package demo under this app's build output. Astro
 * builds its own shell to `dist/`; this integration copies each demo's
 * already-built `dist/` beside it, at `dist/<slug>/`, once Astro's own
 * build finishes.
 */
export function createDemoIntegration(options: IntegrationOptions): AstroIntegration {
  const discover = options.discoverBuiltDemos ?? discoverBuiltDemos;
  return {
    name: "codenhub-package-demos",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        const outputRoot = fileURLToPath(dir);
        for (const builtDemo of discover(options.packagesRoot)) {
          if (!existsSync(builtDemo.distPath)) {
            throw new Error(
              `${builtDemo.slug} demo has no built dist/ output. Build packages/${builtDemo.slug}/demo before building apps/demo.`,
            );
          }
          cpSync(builtDemo.distPath, path.join(outputRoot, builtDemo.slug), { recursive: true });
        }
      },
    },
  };
}
