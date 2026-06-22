import { addLoaderPlugin } from "@codenhub/vite-plugin-add-loader";
import { deferCssPlugin } from "@codenhub/vite-plugin-defer-css";
import { iconsPlugin } from "@codenhub/vite-plugin-icons";
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
