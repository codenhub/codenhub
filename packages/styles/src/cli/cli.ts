#!/usr/bin/env node
import { createRequire } from "node:module";

import { run } from "./run.js";

process.exitCode = await run(process.argv.slice(2), {
  cwd: process.cwd(),
  nodeVersion: process.versions.node,
  // From this file, so the Tailwind packages are found where `tw/` itself imports `tailwindcss` from.
  resolvePackage: createRequire(import.meta.url).resolve,
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
});
