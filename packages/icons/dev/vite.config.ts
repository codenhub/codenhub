import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

import { viteIcons } from "../src/vite/index.ts";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: resolve(__dirname, "../playground"),
  plugins: [
    viteIcons({
      content: [resolve(__dirname, "../playground/index.html")],
    }),
  ],
  resolve: {
    alias: {
      "@codenhub/icons/postcss": resolve(__dirname, "../src/postcss/index.ts"),
      "@codenhub/icons/vite": resolve(__dirname, "../src/vite/index.ts"),
      "@codenhub/icons": resolve(__dirname, "../src/index.ts"),
    },
  },
  server: {
    port: 5185,
  },
});
