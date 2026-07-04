import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: resolve(__dirname, "../playground"),
  plugins: [
    tailwindcss(),
    {
      name: "watch-tailwind-cli",
      configureServer(server) {
        const child = spawn(
          "pnpm",
          ["exec", "tailwindcss", "-i", "./src/index.css", "-o", "./dist/index.css", "--watch"],
          {
            cwd: resolve(__dirname, ".."),
            shell: true,
            stdio: "inherit",
          },
        );
        child.unref();

        server.httpServer?.on("close", () => {
          if (process.platform === "win32" && child.pid) {
            spawn("taskkill", ["/pid", child.pid.toString(), "/f", "/t"], { stdio: "ignore" });
          } else {
            child.kill();
          }
        });
      },
    },
  ],
  resolve: {
    alias: {
      "@codenhub/styles/tw": resolve(__dirname, "../src/index.css"),
      "@codenhub/styles": resolve(__dirname, "../dist/index.css"),
    },
  },
  server: {
    port: 5183,
  },
});
