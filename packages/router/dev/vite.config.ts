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
      "@codenhub/router": resolve(__dirname, "../src/index.ts"),
    },
  },
  server: {
    port: 5187,
  },
});
