#!/usr/bin/env node
import { runBuild } from "./build.js";

const command = process.argv[2];

if (command === "build") {
  runBuild().catch((err) => {
    console.error("Build failed:", err);
    process.exit(1);
  });
} else {
  console.error("Unknown command. Usage: bbp <command>");
  console.error("\nAvailable commands:");
  console.error("  build    Build the Bubble plugin (compiles actions and elements)");
  process.exit(1);
}
