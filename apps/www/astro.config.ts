import path from "node:path";
import { fileURLToPath } from "node:url";

import logos from "@codenhub/icons/data/logos";
import lucide from "@codenhub/icons/data/lucide";
import simpleIcons from "@codenhub/icons/data/simple-icons";
import { viteIcons } from "@codenhub/icons/vite";
import { defineConfig } from "astro/config";

import { createReleaseSnapshotIntegration } from "./src/lib/release-snapshot-integration";
import { siteConfig } from "./src/site-config";

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const packagesRoot = path.resolve(appRoot, "../../packages");

export default defineConfig({
  site: siteConfig.siteUrl,
  integrations: [
    createReleaseSnapshotIntegration({
      logosRoot: path.join(appRoot, "public/logos"),
      repoRoot: path.resolve(packagesRoot, ".."),
      snapshotRoot: path.join(appRoot, ".codenhub-published"),
    }),
  ],
  vite: {
    plugins: [
      // Inline SVG mode: every literal `<i class="ic-…">` tag in this app's
      // templates and the shared shell becomes an `<svg>` at build time. A
      // class built from data cannot be seen by the plugin and would render
      // nothing, so an icon picked from data comes from its
      // `virtual:@codenhub/icons/…` module through `decorative`
      // (`src/lib/icon.ts`).
      viteIcons({
        mode: "svg",
        families: [lucide, simpleIcons, logos],
        defaultPrefix: "lucide",
      }),
    ],
  },
});
