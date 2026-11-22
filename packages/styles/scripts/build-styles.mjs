/**
 * Compiles the stylesheet entrypoints into `dist/` with this package's own
 * compiler, `scripts/lib/compile.mjs`: no Tailwind runs here. A `/tw`
 * consumer's Tailwind compiles the same classes from `tw/` to the same bytes,
 * which `tests/integration/adapter.test.ts` checks.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createCompiler } from "./lib/compile.mjs";
import { AESTHETICS_ENTRIES, STYLES_ENTRIES } from "./lib/entries.mjs";
import { withNotice } from "./notice.mjs";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

const isStylesOnly = process.argv.includes("--styles");
const isAestheticsOnly = process.argv.includes("--aesthetics");

const jobs = isStylesOnly
  ? STYLES_ENTRIES
  : isAestheticsOnly
    ? AESTHETICS_ENTRIES
    : [...STYLES_ENTRIES, ...AESTHETICS_ENTRIES];

mkdirSync(path.join(packageRoot, "dist", "aesthetics"), { recursive: true });

/* Every compiled export's `types` condition points here (`/tw` has its own in
   `tw/`, from `build-tw.mjs`). TypeScript 6 checks
   side-effect imports (`noUncheckedSideEffectImports`), and a specifier such
   as `@codenhub/styles` has no `.css` extension for a `declare module "*.css"`
   to match, so without a declaration it fails with TS2882. An empty module
   declares nothing: the import is for its side effect alone. It is a `.d.cts`
   because a `.d.ts` in this `"type": "module"` package is an ES module, which
   a CommonJS file under `module: node16` or `node18` cannot import (TS1479);
   a CommonJS declaration is one an ES file may import too. */
writeFileSync(path.join(packageRoot, "dist", "index.d.cts"), "export {};\n");

const compiler = createCompiler(path.join(packageRoot, "src"));

for (const { input, output, omit } of jobs) {
  const css = compiler.compile(path.join(packageRoot, input), { omit });

  writeFileSync(path.join(packageRoot, output), withNotice(css));
}
