#!/usr/bin/env node
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

/**
 * Bubble Plugin build runner.
 * Compiles TS action and element files using tsdown and formats them
 * for copy-pasting into the Bubble plugin editor.
 */
export function runBuild() {
  const cwd = process.cwd();
  console.log(`Building Bubble plugin in ${cwd}...`);

  // Clean dist directory once at start
  const distDir = path.join(cwd, "dist");
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }

  // Scan src/actions
  const actionsDir = path.join(cwd, "src/actions");
  if (fs.existsSync(actionsDir)) {
    const files = fs.readdirSync(actionsDir).filter((f: string) => f.endsWith(".ts"));
    for (const file of files) {
      const entry = path.join(actionsDir, file);
      const outName = file.replace(/\.ts$/, ".js");
      const outDir = path.join(cwd, "dist/actions");
      const outPath = path.join(outDir, outName);

      console.log(`Compiling action: ${file}`);
      execSync(`npx tsdown "${entry}" --format esm --no-dts --no-clean --out-dir "${outDir}" --no-fixed-extension`, {
        cwd,
        stdio: "inherit",
      });

      // Post-process to remove exports and append execution hook
      if (fs.existsSync(outPath)) {
        let content = fs.readFileSync(outPath, "utf8");
        content = cleanExports(content);

        // Check if server-side action or client-side action
        if (file.endsWith("-server.ts") || content.includes("async function action")) {
          content += "\n\n// Execute server-side action\nreturn action(properties, context);";
        } else if (content.includes("function action")) {
          content += "\n\n// Execute action\naction(properties, context);";
        }

        fs.writeFileSync(outPath, content, "utf8");
      }
    }
  }

  // Scan src/elements
  const elementsDir = path.join(cwd, "src/elements");
  if (fs.existsSync(elementsDir)) {
    const elements = fs.readdirSync(elementsDir).filter((f: string) => {
      return fs.statSync(path.join(elementsDir, f)).isDirectory();
    });

    for (const element of elements) {
      const elDir = path.join(elementsDir, element);
      const files = fs.readdirSync(elDir).filter((f: string) => f.endsWith(".ts"));

      for (const file of files) {
        const entry = path.join(elDir, file);
        const outName = file.replace(/\.ts$/, ".js");
        const outDir = path.join(cwd, "dist/elements", element);
        const outPath = path.join(outDir, outName);

        console.log(`Compiling element (${element}) file: ${file}`);
        execSync(`npx tsdown "${entry}" --format esm --no-dts --no-clean --out-dir "${outDir}" --no-fixed-extension`, {
          cwd,
          stdio: "inherit",
        });

        if (fs.existsSync(outPath)) {
          let content = fs.readFileSync(outPath, "utf8");
          content = cleanExports(content);

          const baseName = path.basename(file, ".ts");
          if (baseName === "initialize") {
            content += "\n\n// Initialize element\ninitialize(instance, context);";
          } else if (baseName === "update") {
            content += "\n\n// Update element\nupdate(instance, properties, context);";
          } else if (baseName === "preview") {
            content += "\n\n// Preview element\npreview(instance, properties, context);";
          }

          fs.writeFileSync(outPath, content, "utf8");
        }
      }
    }
  }

  console.log("Build completed successfully.");
}

/**
 * Strips ES module export keywords from generated bundle to prevent
 * syntax errors when running directly in Bubble's javascript input area.
 */
function cleanExports(content: string): string {
  return content
    .replace(/^export\s+default\s+/gm, "")
    .replace(/^export\s+(async\s+)?function\s+/gm, "$1function ")
    .replace(/^export\s+const\s+/gm, "const ")
    .replace(/^export\s+class\s+/gm, "class ")
    .replace(/^export\s+interface\s+/gm, "interface ")
    .replace(/^export\s+type\s+/gm, "type ")
    .replace(/export\s+\{[^}]+\};?/gm, "");
}
