/**
 * Compiles stylesheet entrypoints into `dist/` concurrently with Tailwind's
 * compiler, in one process.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compile, optimize, Polyfills } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

const STYLES_JOBS = [
  { input: "./src/index.css", output: "./dist/index.css" },
  { input: "./src/theme.compiled.css", output: "./dist/theme.css" },
  { input: "./src/palette.css", output: "./dist/palette.css" },
  { input: "./src/components/index.css", output: "./dist/components.css" },
  { input: "./src/native.css", output: "./dist/native.css" },
];

const AESTHETICS_JOBS = [
  { input: "./src/aesthetics/index.css", output: "./dist/aesthetics/index.css" },
  { input: "./src/aesthetics/neobrutalism.css", output: "./dist/aesthetics/neobrutalism.css" },
  { input: "./src/aesthetics/glass.css", output: "./dist/aesthetics/glass.css" },
  { input: "./src/aesthetics/pixel.css", output: "./dist/aesthetics/pixel.css" },
  { input: "./src/aesthetics/chunky-tile.css", output: "./dist/aesthetics/chunky-tile.css" },
  { input: "./src/aesthetics/cyber.css", output: "./dist/aesthetics/cyber.css" },
  { input: "./src/aesthetics/sketch.css", output: "./dist/aesthetics/sketch.css" },
];

const isStylesOnly = process.argv.includes("--styles");
const isAestheticsOnly = process.argv.includes("--aesthetics");

const jobs = isStylesOnly ? STYLES_JOBS : isAestheticsOnly ? AESTHETICS_JOBS : [...STYLES_JOBS, ...AESTHETICS_JOBS];

mkdirSync(path.join(packageRoot, "dist", "aesthetics"), { recursive: true });

/* Every compiled export's `types` condition points here (`/tw` has its own in
   `tw/`, from `build-tw.mjs`). TypeScript 6 checks
   side-effect imports (`noUncheckedSideEffectImports`), and a specifier such
   as `@codenhub/styles` has no `.css` extension for a `declare module "*.css"`
   to match, so without a declaration it fails with TS2882. An empty module
   declares nothing: the import is for its side effect alone. */
writeFileSync(path.join(packageRoot, "dist", "index.d.ts"), "export {};\n");

/* Tailwind's polyfills are off. From 4.3.3 Tailwind follows every `color-mix()`
   that reads a `var()` with a fallback for browsers without `color-mix()`, and
   every registered property with a fallback for browsers without `@property`.
   Every browser this package supports has both (Chrome 123, Safari 17.5,
   Firefox 128), so the fallbacks never apply, and they were 290 `@supports`
   blocks in `dist/index.css`: 17% of it minified, 16% gzipped. Tailwind's CLI
   cannot turn them off, so this calls the compiler the CLI wraps, with the
   CLI's own source detection and minification, and changes nothing else:
   with `Polyfills.All` the output is byte-identical to the CLI's.
   `tests/integration/size.test.ts` fails if a fallback comes back. */
const POLYFILLS = Polyfills.None;

async function compileJob({ input, output }) {
  const inputPath = path.resolve(packageRoot, input);
  const compiler = await compile(readFileSync(inputPath, "utf8"), {
    base: path.dirname(inputPath),
    from: inputPath,
    polyfills: POLYFILLS,
    onDependency() {},
  });
  const autoSource = { base: packageRoot, pattern: "**/*", negated: false };
  const rootSources =
    compiler.root === "none" ? [] : compiler.root === null ? [autoSource] : [{ ...compiler.root, negated: false }];
  const scanner = new Scanner({
    sources: [
      ...rootSources,
      ...compiler.sources,
      { base: path.dirname(inputPath), pattern: path.basename(inputPath), negated: false },
    ],
  });
  const { code } = optimize(compiler.build(scanner.scan()), { file: input, minify: true });

  writeFileSync(path.resolve(packageRoot, output), code);
}

await Promise.all(jobs.map(compileJob));
