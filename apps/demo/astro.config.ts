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
      // .astro sources aren't in the plugin's default-scanned extensions, so
      // the icon classes this shell writes need to be named explicitly here.
      viteIcons({ content: ["./src/**/*.astro"], defaultPrefix: "lucide", families: [lucide, phosphor] }),
    ],
  },
});
