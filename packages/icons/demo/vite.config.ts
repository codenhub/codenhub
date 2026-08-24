import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

import lucide from "../data/lucide/icons.json" with { type: "json" };
import type { IconFamilyData } from "../src/index.ts";
import { viteIcons } from "../src/vite/index.ts";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: resolve(__dirname, "."),
  plugins: [
    viteIcons({
      families: [lucide as IconFamilyData],
      content: [resolve(__dirname, "index.html"), resolve(__dirname, "main.ts")],
    }),
  ],
  resolve: {
    alias: {
      "@codenhub/icons/data/lucide": resolve(__dirname, "../data/lucide/icons.json"),
      "@codenhub/icons/postcss": resolve(__dirname, "../src/postcss/index.ts"),
      "@codenhub/icons/vite": resolve(__dirname, "../src/vite/index.ts"),
      "@codenhub/icons": resolve(__dirname, "../src/index.ts"),
      "@codenhub/styles/native": resolve(__dirname, "../../styles/dist/native.css"),
      "@codenhub/styles": resolve(__dirname, "../../styles/dist/index.css"),
    },
  },
  server: {
    port: 5186,
  },
});
