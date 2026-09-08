import path from "node:path";
import { fileURLToPath } from "node:url";

import lucide from "@codenhub/icons/data/lucide";
import phosphor from "@codenhub/icons/data/phosphor";
import { viteIcons } from "@codenhub/icons/vite";
import { defineConfig } from "astro/config";

import { createDemoIntegration } from "./src/lib/demo-integration";
import { createDemoDevProxyIntegration } from "./src/lib/dev-proxy-integration";
import { siteConfig } from "./src/site-config";

const packagesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../packages");

export default defineConfig({
  site: siteConfig.baseUrl,
  integrations: [createDemoIntegration({ packagesRoot }), createDemoDevProxyIntegration({ packagesRoot })],
  vite: {
    plugins: [
      /* svg mode inlines each icon into the built markup, so the shell ships no
         mask stylesheet and no icon class survives the build. `content` is not
         listed because it feeds stylesheet generation, which this mode does not
         do; the plugin rewrites `.astro` files through its transform instead. */
      viteIcons({ defaultPrefix: "lucide", families: [lucide, phosphor], mode: "svg" }),
    ],
  },
});
