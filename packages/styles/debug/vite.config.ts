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
    /* Draws the `ic-*` glyphs the forms fixtures use, before `tailwindcss()`:
       both are `enforce: "pre"` and the icon `@import` has to resolve before
       Tailwind compiles the sheet. Only Lucide is registered. */
    viteIcons({
      families: [lucide],
      defaultPrefix: "lucide",
      content: globSync("**/*.html", { cwd: playgroundRoot }).map((file) => resolve(playgroundRoot, file)),
    }),
    tailwindcss(),
  ],
  server: {
    port: 5184,
  },
});
