/**
 * Emits the static base stylesheet published at the package root.
 *
 * `@import "@codenhub/icons"` resolves to this file in every pipeline, and no
 * plugin rewrites it. The file carries the base `.ic` rules every icon class
 * builds on; the per-icon mask rules come from a family stylesheet, the
 * Tailwind plugin, or the Vite or PostCSS plugin.
 */
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { generateBaseCss } from "../dist/index.js";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(packageDirectory, "dist", "style.css");

const banner = `/*!
 * @codenhub/icons base stylesheet.
 *
 * Base rules only. Per-icon mask rules come from a family stylesheet, the
 * Tailwind plugin, or the Vite or PostCSS plugin.
 */
`;

await writeFile(outputPath, `${banner}${generateBaseCss({ prefix: "ic" })}\n`, "utf8");

console.log("Built dist/style.css.");
