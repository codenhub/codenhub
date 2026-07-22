import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.dirname(fileURLToPath(new URL("../../package.json", import.meta.url)));

function buildStyles() {
  const pnpmPath = process.env.npm_execpath;
  if (!pnpmPath) {
    throw new Error("pnpm executable path is unavailable.");
  }

  const isJavaScriptEntrypoint = /\.[cm]?js$/i.test(pnpmPath);
  const command = isJavaScriptEntrypoint ? process.execPath : pnpmPath;
  const args = isJavaScriptEntrypoint ? [pnpmPath, "build"] : ["build"];

  execFileSync(command, args, {
    cwd: packageRoot,
    stdio: "inherit",
  });
}

export default function setup() {
  buildStyles();
}

export const onTestsRerun = buildStyles;
