import { execFileSync } from "node:child_process";
import { globSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import lucide from "@codenhub/icons/data/lucide";
import { viteIcons } from "@codenhub/icons/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const playgroundRoot = resolve(__dirname, "../playground");
const sourceRoot = resolve(__dirname, "../src");
const buildTw = () => {
  execFileSync(process.execPath, [resolve(__dirname, "../scripts/build-tw.mjs")], { stdio: "inherit" });
};

/* The playground reads `tw/`, the Tailwind source a consumer gets, which
   `scripts/build-tw.mjs` generates from `src/`: `src/` itself is the
   package's own CSS, with `@compose`, and Tailwind cannot compile it. So
   `tw/` is generated when the server starts and again when a stylesheet in
   `src/` changes, and Tailwind's own watcher reloads the page from there. */
const liveTw: Plugin = {
  name: "codenhub-styles-live-tw",
  buildStart: buildTw,
  configureServer(server) {
    server.watcher.add(sourceRoot);
    server.watcher.on("all", (_event, changed) => {
      if (changed.startsWith(sourceRoot) && changed.endsWith(".css")) {
        buildTw();
      }
    });
  },
};

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
    liveTw,
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@codenhub/styles/aesthetics/tw": resolve(__dirname, "../tw/aesthetics/index.css"),
      "@codenhub/styles/aesthetics": resolve(__dirname, "../tw/aesthetics/index.css"),
      "@codenhub/styles/components": resolve(__dirname, "../tw/components/index.css"),
      "@codenhub/styles/native/tw": resolve(__dirname, "../tw/native.css"),
      "@codenhub/styles/tw": resolve(__dirname, "../tw/index.css"),
      "@codenhub/styles/native": resolve(__dirname, "../tw/native.css"),
      "@codenhub/styles": resolve(__dirname, "../tw/index.css"),
    },
  },
  server: {
    port: 5183,
  },
});
