import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { IconFamilyData } from "@codenhub/icons";
import { viteIcons } from "@codenhub/icons/vite";
import { defineConfig } from "vite";

import lucide from "../data/lucide/icons.json" with { type: "json" };

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
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
