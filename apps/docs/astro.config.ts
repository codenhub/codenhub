import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  markdown: {
    shikiConfig: {
      theme: "github-dark-default",
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
