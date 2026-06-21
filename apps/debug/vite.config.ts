import { addLoaderPlugin, deferCssPlugin, iconsPlugin } from "@codenhub/vite-plugins";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

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
