import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { addLoaderPlugin, deferCssPlugin, iconsPlugin } from "@codenhub/vite-plugins";

export default defineConfig({
  root: "./src",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rolldownOptions: {
      input: "./src/index.html",
    },
  },
  plugins: [tailwindcss(), addLoaderPlugin(), deferCssPlugin(), iconsPlugin()],
});
