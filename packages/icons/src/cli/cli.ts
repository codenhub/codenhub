#!/usr/bin/env node
import { run } from "./run.js";

process.exitCode = await run(process.argv.slice(2), {
  cwd: process.cwd(),
  nodeVersion: process.versions.node,
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
});
