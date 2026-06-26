import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT ?? 5173);
const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
]);

const watchers = [
  spawn(
    "pnpm",
    ["exec", "tailwindcss", "-i", "./tests/vanilla/index.css", "-o", "./tests/vanilla/output.css", "--watch"],
    {
      cwd: ROOT,
      shell: true,
      stdio: "inherit",
    },
  ),
  spawn("pnpm", ["exec", "tailwindcss", "-i", "./tests/build/index.css", "-o", "./tests/build/output.css", "--watch"], {
    cwd: ROOT,
    shell: true,
    stdio: "inherit",
  }),
  spawn("pnpm", ["exec", "tailwindcss", "-i", "./src/index.css", "-o", "./dist/index.css", "--watch"], {
    cwd: ROOT,
    shell: true,
    stdio: "inherit",
  }),
  spawn("pnpm", ["exec", "tailwindcss", "-i", "./src/theme.css", "-o", "./dist/theme.css", "--watch"], {
    cwd: ROOT,
    shell: true,
    stdio: "inherit",
  }),
  spawn("pnpm", ["exec", "tailwindcss", "-i", "./src/components/index.css", "-o", "./dist/components.css", "--watch"], {
    cwd: ROOT,
    shell: true,
    stdio: "inherit",
  }),
];

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://localhost:${PORT}`);
    const pathname = url.pathname === "/" ? "/tests/preview/index.html" : decodeURIComponent(url.pathname);
    const filePath = resolve(ROOT, `.${normalize(pathname)}`);

    if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${sep}`)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const fileStat = await stat(filePath);
    const resolvedFilePath = fileStat.isDirectory() ? join(filePath, "index.html") : filePath;
    const contentType = contentTypes.get(extname(resolvedFilePath)) ?? "application/octet-stream";

    response.writeHead(200, { "Content-Type": contentType });
    createReadStream(resolvedFilePath).pipe(response);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`Preview: http://localhost:${PORT}/tests/preview/index.html?env=vanilla`);
  console.log(`Build:   http://localhost:${PORT}/tests/preview/index.html?env=build`);
});

const shutdown = () => {
  for (const watcher of watchers) {
    watcher.kill();
  }

  server.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
