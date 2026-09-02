/**
 * Emits one complete stylesheet per icon family, and the Tailwind entry point.
 *
 * These are the plugin-free path: `@import "@codenhub/icons/lucide"` has to
 * deliver working icons through nothing but CSS resolution, so every icon of
 * the family is written out ahead of time. It is large by construction -- the
 * whole family is there because no build step is present to narrow it -- which
 * is why the family is chosen one import at a time rather than all at once.
 *
 * Each rule carries two selectors: the qualified `ic-lucide-heart` and the bare
 * `ic-heart`. They share one copy of the artwork, so the bare name costs a
 * selector rather than a second data URI, and the last family a project imports
 * wins the bare names by plain cascade. That is what replaces the default
 * prefix a stylesheet has no way to configure.
 */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { generateBaseCss, generateFamilyCss } from "../dist/index.js";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDirectory = resolve(packageDirectory, "data");
const outputDirectory = resolve(packageDirectory, "dist", "css");
const twDirectory = resolve(packageDirectory, "dist", "tw");

const PREFIX = "ic";

const TW_ENTRY = `/*!
 * @codenhub/icons Tailwind CSS v4 entry point.
 *
 * Base rules plus the plugin that generates icons on demand. Every family the
 * package ships is resolvable; only the icons your markup uses are emitted.
 *
 * To configure the plugin -- a default family for unqualified names, a narrower
 * family list, a stroke width -- import "@codenhub/icons" for the base rules
 * and declare the plugin yourself instead of importing this file:
 *
 *   @import "@codenhub/icons";
 *   @plugin "@codenhub/icons/tailwind" {
 *     default: lucide;
 *   }
 */
@plugin "@codenhub/icons/tailwind";

`;

const families = (
  await readdir(dataDirectory, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  })
)
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

await mkdir(outputDirectory, { recursive: true });
await mkdir(twDirectory, { recursive: true });

let total = 0;
await Promise.all(
  families.map(async (prefix) => {
    const family = (await import(`../dist/data/${prefix}.js`)).default;
    const css = generateFamilyCss(family, { prefix: PREFIX });
    total += css.length;
    await writeFile(resolve(outputDirectory, `${prefix}.css`), css, "utf8");
  }),
);

await writeFile(resolve(twDirectory, "index.css"), `${TW_ENTRY}${generateBaseCss({ prefix: PREFIX })}\n`, "utf8");

console.log(
  `Built ${families.length} family stylesheet(s), ${(total / 1024 / 1024).toFixed(1)} MB, and dist/tw/index.css.`,
);
