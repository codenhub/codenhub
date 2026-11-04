import path from "node:path";
import { fileURLToPath } from "node:url";

import { rehypeHeadingIds, unified } from "@astrojs/markdown-remark";
import { remarkAlerts } from "@codenhub/app-shell/remark-alerts";
import lucide from "@codenhub/icons/data/lucide";
import simpleIcons from "@codenhub/icons/data/simple-icons";
import { viteIcons } from "@codenhub/icons/vite";
import { TRANSLATION_LOCALES } from "@codenhub/tools/documentation";
import { snapshotPackagesRoot } from "@codenhub/tools/release";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

import { createDocumentationIntegration } from "./src/lib/documentation-integration";
import { createLocaleNotFoundIntegration } from "./src/lib/locale-not-found-integration";
import { createCodeBlockTransformer } from "./src/lib/markdown/code-blocks";
import { rehypeMarkdownEnhancements } from "./src/lib/markdown/rehype-enhancements";
import { createPublishedDocsSnapshotIntegration } from "./src/lib/published-docs-snapshot-integration";
import { siteConfig } from "./src/site-config";

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const packagesRoot = path.resolve(appRoot, "../../packages");
const repoRoot = path.resolve(packagesRoot, "..");
const publishedDocsSnapshotRoot = path.resolve(appRoot, ".codenhub-published-docs");

export default defineConfig({
  site: siteConfig.siteUrl,
  // Order matters: setup hooks run in sequence, and the documentation
  // integration reads the snapshot the first one writes.
  integrations: [
    createPublishedDocsSnapshotIntegration({ repoRoot, snapshotRoot: publishedDocsSnapshotRoot }),
    createDocumentationIntegration({
      packagesRoot,
      publishedPackagesRoot: snapshotPackagesRoot(publishedDocsSnapshotRoot),
    }),
    createLocaleNotFoundIntegration(TRANSLATION_LOCALES),
  ],
  markdown: {
    processor: unified({
      rehypePlugins: [rehypeHeadingIds, rehypeMarkdownEnhancements],
      remarkPlugins: [remarkAlerts],
    }),
    shikiConfig: {
      theme: "github-dark-default",
      transformers: [createCodeBlockTransformer()],
    },
  },
  vite: {
    plugins: [
      tailwindcss(),
      /* Inline SVG mode: every literal `<i class="ic-…">` tag in this app and the
         shared shell becomes an `<svg>` at build time. CSS mode generated its
         stylesheet before Astro bundled the client scripts, so icons only those
         scripts named got no mask rule and rendered as solid squares. An icon
         chosen at runtime comes from a `virtual:@codenhub/icons/…` module. */
      viteIcons({
        mode: "svg",
        families: [lucide, simpleIcons],
        defaultPrefix: "lucide",
      }),
    ],
  },
});
