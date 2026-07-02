import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: resolve(__dirname, "../playground"),
  plugins: [tailwindcss()],
  resolve: {
    alias: {
      "@codenhub/styles": resolve(__dirname, "../src/index.css"),
    },
  },
  server: {
    port: 5183,
  },
});
