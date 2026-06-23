#!/usr/bin/env node
import { runBuild } from "./build.js";

const command = process.argv[2];

function printUsage(): void {
  console.log("Usage: bbp <command>");
  console.log("\nAvailable commands:");
  console.log("  build    Build the Bubble plugin (compiles actions and elements)");
  console.log("  help     Show this help message");
}

if (command === "build") {
  runBuild().catch((err) => {
    console.error("Build failed:", err);
    process.exit(1);
  });
} else if (command === "help" || command === "--help" || command === "-h" || !command) {
  printUsage();
  process.exit(0);
} else {
  console.error(`Unknown command: ${command}`);
  printUsage();
  process.exit(1);
}
