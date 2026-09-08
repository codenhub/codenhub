import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { IconFamilyData } from "@codenhub/icons";
import { viteIcons } from "@codenhub/icons/vite";
import { defineConfig } from "vite";

import lucide from "../data/lucide/icons.json" with { type: "json" };

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  /* `apps/demo` mounts this build at `/icons/`, the package directory name,
     per the URL scheme in `docs/specs/packages-demo.md`. Setting it here rather
     than passing `--base` from the aggregator is what keeps the built asset
     URLs and `import.meta.env.BASE_URL` agreeing in dev and in a build. */
  base: "/icons/",
  root: resolve(__dirname, "."),
  plugins: [
    viteIcons({
      families: [lucide as IconFamilyData],
      defaultPrefix: "lucide",
      content: [resolve(__dirname, "index.html"), resolve(__dirname, "*.ts")],
    }),
  ],
  resolve: {
    alias: {
      "@codenhub/styles/native": resolve(__dirname, "../../styles/dist/native.css"),
      "@codenhub/styles": resolve(__dirname, "../../styles/dist/index.css"),
    },
  },
  server: {
    port: 5186,
  },
});
