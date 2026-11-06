#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseArgs } from "./args.ts";
import { runAll, type TaskConfig } from "./run.ts";

const options = parseArgs(process.argv.slice(2));
const config = JSON.parse(readFileSync(options.config, "utf8")) as TaskConfig;
const results = await runAll(config, options);
for (const { command, ok } of results) {
  console.log(`${ok ? "PASS" : "FAIL"} ${command}`);
}
process.exitCode = results.every((r) => r.ok) ? 0 : 1;
