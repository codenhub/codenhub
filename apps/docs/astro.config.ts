import path from "node:path";
import { fileURLToPath } from "node:url";

import { rehypeHeadingIds, unified } from "@astrojs/markdown-remark";
import lucide from "@codenhub/icons/data/lucide";
import { viteIcons } from "@codenhub/icons/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

import { createDocumentationIntegration } from "./src/lib/documentation-integration";
import { createCodeBlockTransformer } from "./src/lib/markdown/code-blocks";
import { rehypeMarkdownEnhancements } from "./src/lib/markdown/rehype-enhancements";
import { remarkAlerts } from "./src/lib/markdown/remark-alerts";
import { siteConfig } from "./src/site-config";

const packagesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../packages");

export default defineConfig({
  site: siteConfig.siteUrl,
  integrations: [createDocumentationIntegration({ packagesRoot })],
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
      /* Chrome icons for the shared shell. CSS mode: the shell's `<i class="ic-…">`
         markup resolves under node_modules, which the plugin's scan skips, so its
         classes reach the generated stylesheet through the `content` glob. */
      viteIcons({
        mode: "css",
        families: [lucide],
        defaultPrefix: "lucide",
        content: [path.join(packagesRoot, "app-shell/src/**/*.astro")],
      }),
    ],
  },
});
