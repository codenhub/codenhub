/**
 * Compiles stylesheet entrypoints into `dist/` concurrently using the Tailwind CLI.
 *
 * Running each invocation sequentially in `package.json` spawned 12 individual CLI
 * processes in a chain, which added significant overhead. This script compiles all
 * targets (or the selected subset) concurrently with Promise.all.
 */
import { execFile } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const executeFile = promisify(execFile);
const packageRoot = fileURLToPath(new URL("..", import.meta.url));

const STYLES_JOBS = [
  { input: "./src/index.css", output: "./dist/index.css" },
  { input: "./src/theme.css", output: "./dist/theme.css" },
  { input: "./src/palette.css", output: "./dist/palette.css" },
  { input: "./src/components/index.css", output: "./dist/components.css" },
  { input: "./src/native.css", output: "./dist/native.css" },
];

const AESTHETICS_JOBS = [
  { input: "./src/aesthetics/index.css", output: "./dist/aesthetics/index.css" },
  { input: "./src/aesthetics/neobrutalism.css", output: "./dist/aesthetics/neobrutalism.css" },
  { input: "./src/aesthetics/glass.css", output: "./dist/aesthetics/glass.css" },
  { input: "./src/aesthetics/pixel.css", output: "./dist/aesthetics/pixel.css" },
  { input: "./src/aesthetics/chunky-tile.css", output: "./dist/aesthetics/chunky-tile.css" },
  { input: "./src/aesthetics/cyber.css", output: "./dist/aesthetics/cyber.css" },
  { input: "./src/aesthetics/sketch.css", output: "./dist/aesthetics/sketch.css" },
];

const isStylesOnly = process.argv.includes("--styles");
const isAestheticsOnly = process.argv.includes("--aesthetics");

const jobs = isStylesOnly ? STYLES_JOBS : isAestheticsOnly ? AESTHETICS_JOBS : [...STYLES_JOBS, ...AESTHETICS_JOBS];

mkdirSync(path.join(packageRoot, "dist", "aesthetics"), { recursive: true });

const binName = process.platform === "win32" ? "tailwindcss.CMD" : "tailwindcss";
const binPath = path.join(packageRoot, "node_modules", ".bin", binName);

async function compileJob({ input, output }) {
  if (process.platform === "win32") {
    const commandLine = `"${binPath}" -i ${input} -o ${output} --minify`;
    await executeFile(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", commandLine], {
      cwd: packageRoot,
      windowsVerbatimArguments: true,
    });
  } else {
    await executeFile(binPath, ["-i", input, "-o", output, "--minify"], { cwd: packageRoot });
  }
}

await Promise.all(jobs.map(compileJob));
