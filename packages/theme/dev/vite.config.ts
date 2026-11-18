import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { IconFamilyData } from "@codenhub/icons";
import { viteIcons } from "@codenhub/icons/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

import lucide from "../../icons/data/lucide/icons.json" with { type: "json" };

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: resolve(__dirname, "../playground"),
  plugins: [
    tailwindcss(),
    viteIcons({ families: [lucide as IconFamilyData], defaultPrefix: "lucide", content: ["index.html", "*.ts"] }),
  ],
  resolve: {
    alias: {
      "@codenhub/styles/native/tw": resolve(__dirname, "../../styles/tw/native.css"),
      "@codenhub/styles/tw": resolve(__dirname, "../../styles/tw/index.css"),
      "@codenhub/styles/native": resolve(__dirname, "../../styles/dist/native.css"),
      "@codenhub/styles": resolve(__dirname, "../../styles/dist/index.css"),
      "@codenhub/theme": resolve(__dirname, "../src/index.ts"),
    },
  },
  server: {
    port: 5185,
  },
});
