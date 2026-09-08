import path from "node:path";
import { fileURLToPath } from "node:url";

import lucide from "@codenhub/icons/data/lucide";
import { viteIcons } from "@codenhub/icons/vite";
import { defineConfig } from "astro/config";

import { siteConfig } from "./src/site-config";

const packagesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../packages");

export default defineConfig({
  site: siteConfig.siteUrl,
  vite: {
    plugins: [
      viteIcons({
        mode: "css",
        families: [lucide],
        defaultPrefix: "lucide",
        // The shared shell's `<i class="ic-…">` markup resolves under
        // node_modules, which the plugin's own scan skips; this glob is how its
        // classes reach the generated stylesheet.
        content: [path.join(packagesRoot, "app-shell/src/**/*.astro")],
      }),
    ],
  },
});
