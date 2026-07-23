import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

import { viteIcons } from "../dist/vite.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: resolve(__dirname, "../playground"),
  plugins: [
    viteIcons({
      content: [resolve(__dirname, "../playground/index.html")],
    }),
  ],
  server: {
    port: 5186,
  },
});
