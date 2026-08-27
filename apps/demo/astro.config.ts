import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "astro/config";

import { createDemoIntegration } from "./src/lib/demo-integration";
import { siteConfig } from "./src/site-config";

const packagesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../packages");

export default defineConfig({
  site: siteConfig.baseUrl,
  integrations: [createDemoIntegration({ packagesRoot })],
});
