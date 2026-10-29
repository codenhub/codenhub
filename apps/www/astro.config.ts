import path from "node:path";
import { fileURLToPath } from "node:url";

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
      viteIcons({
        mode: "css",
        families: [lucide, simpleIcons],
        defaultPrefix: "lucide",
        // The shared shell's `<i class="ic-…">` markup resolves under
        // node_modules, which the plugin's own scan skips; this glob is how its
        // classes reach the generated stylesheet.
        content: [path.join(packagesRoot, "app-shell/src/**/*.astro")],
      }),
    ],
  },
});
