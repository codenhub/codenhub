import { access, rename, rmdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { AstroIntegration } from "astro";

/**
 * Moves each locale's not-found page from `<locale>/404/index.html` to
 * `<locale>/404.html`, beside the root `404.html`.
 *
 * Astro writes only the root `src/pages/404.astro` as a `404.html` file; a
 * `src/pages/[locale]/404.astro` builds like any other page, into a folder. The
 * deployment serves the nearest `404.html` above a missing path, so the file
 * must sit there for a locale's misses to get that locale's page.
 * @param outputDirectory The built site's root.
 * @param locales The locales whose not-found page to move.
 */
export async function moveLocaleNotFoundPages(outputDirectory: string, locales: readonly string[]): Promise<void> {
  await Promise.all(
    locales.map(async (locale) => {
      const folder = path.join(outputDirectory, locale, "404");
      const page = path.join(folder, "index.html");
      try {
        await access(page);
      } catch {
        return;
      }
      await rename(page, path.join(outputDirectory, locale, "404.html"));
      await rmdir(folder);
    }),
  );
}

/**
 * Registers {@link moveLocaleNotFoundPages} to run once the site is built.
 * @param locales The locales that have a not-found page.
 * @returns Astro integration to register in `astro.config.ts`.
 */
export function createLocaleNotFoundIntegration(locales: readonly string[]): AstroIntegration {
  return {
    name: "codenhub-locale-not-found",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        await moveLocaleNotFoundPages(fileURLToPath(dir), locales);
      },
    },
  };
}
