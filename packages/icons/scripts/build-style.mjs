/**
 * Emits the static base stylesheet published at the package root.
 *
 * `@import "@codenhub/icons"` has to resolve to a real file for CSS pipelines
 * that do their own import resolution rather than leaving it to the Vite plugin
 * -- `@tailwindcss/vite` and a plain `<link>` among them. The file carries the
 * base `.ic` rules every icon class builds on; the per-icon mask rules still
 * come from the Vite or PostCSS plugin, which replaces the `@import` with the
 * full generated set when it is in the pipeline.
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
 * Base rules only. Per-icon mask rules are added by the Vite or PostCSS plugin,
 * which replaces this import with the full set scanned from your markup.
 */
`;

await writeFile(outputPath, `${banner}${generateBaseCss({ prefix: "ic" })}\n`, "utf8");

console.log("Built dist/style.css.");
