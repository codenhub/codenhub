import path from "node:path";
import { fileURLToPath } from "node:url";

import lucide from "@codenhub/icons/data/lucide";
import { viteIcons } from "@codenhub/icons/vite";
import { defineConfig } from "astro/config";

import { createDemoIntegration } from "./src/lib/demo-integration";
import { createDemoDevProxyIntegration } from "./src/lib/dev-proxy-integration";
import { siteConfig } from "./src/site-config";

const packagesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../packages");

export default defineConfig({
  site: siteConfig.siteUrl,
  integrations: [createDemoIntegration({ packagesRoot }), createDemoDevProxyIntegration({ packagesRoot })],
  vite: {
    plugins: [
      /* CSS mode: the shell's `<i class="ic-…">` markup resolves under
         node_modules, which the plugin's own scan skips, so its classes reach
         the generated stylesheet through the `content` glob instead. The
         aggregated package demos bring their own icon handling and are
         unaffected. */
      viteIcons({
        mode: "css",
        families: [lucide],
        defaultPrefix: "lucide",
        content: [path.join(packagesRoot, "app-shell/src/**/*.astro")],
      }),
    ],
  },
});
