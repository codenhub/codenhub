import { globSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import lucide from "@codenhub/icons/data/lucide";
import { viteIcons } from "@codenhub/icons/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const playgroundRoot = resolve(__dirname, "../playground");

export default defineConfig({
  root: playgroundRoot,
  plugins: [
    /* Draws the `ic-*` glyphs the forms fixtures use. It runs before
       `tailwindcss()` because both are `enforce: "pre"` and the icon `@import`
       has to be resolved before Tailwind compiles the sheet. Only Lucide is
       registered; the fixtures need nothing else. */
    viteIcons({
      families: [lucide],
      defaultPrefix: "lucide",
      content: globSync("**/*.html", { cwd: playgroundRoot }).map((file) => resolve(playgroundRoot, file)),
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@codenhub/styles/tw/aesthetics": resolve(__dirname, "../src/aesthetics/index.css"),
      "@codenhub/styles/aesthetics": resolve(__dirname, "../src/aesthetics/index.css"),
      "@codenhub/styles/components": resolve(__dirname, "../src/components/index.css"),
      "@codenhub/styles/tw/native": resolve(__dirname, "../src/native.css"),
      "@codenhub/styles/tw": resolve(__dirname, "../src/index.css"),
      "@codenhub/styles/native": resolve(__dirname, "../src/native.css"),
      "@codenhub/styles": resolve(__dirname, "../src/index.css"),
    },
  },
  server: {
    port: 5183,
  },
});
