import { rehypeHeadingIds, unified } from "@astrojs/markdown-remark";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

import { createCodeBlockTransformer } from "./src/lib/markdown/code-blocks";
import { rehypeMarkdownEnhancements } from "./src/lib/markdown/rehype-enhancements";
import { remarkAlerts } from "./src/lib/markdown/remark-alerts";

export default defineConfig({
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
    plugins: [tailwindcss()],
  },
});
