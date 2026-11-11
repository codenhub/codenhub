/**
 * Copies `src/` to `tw/` for the source (`/tw`) entrypoints, dropping the
 * `@source not "..."` and `@source inline("...")` directives on the way.
 *
 * `tw/` sits beside `dist/` rather than inside it, so `dist/` holds finished
 * CSS only: a server that serves or fingerprints `dist/` as static files, such
 * as Django's `ManifestStaticFilesStorage`, never meets a bare
 * `@import "tailwindcss/..."` it cannot resolve. The copy's imports point only
 * at each other and at `tailwindcss`, so they resolve the same from here.
 *
 * The excludes name paths relative to `src/` -- `../dist`, `../demo`, and so
 * on -- and have no job in the copy: a `/tw` consumer scans their own
 * `@source`, not this package's tree.
 *
 * The `@source inline("...")` safelists exist for the compiled build, which has
 * no markup to scan, and name every class the package defines. Left in the
 * copy, they made a `/tw` consumer's build emit all of them whatever their
 * pages used: a page with one `btn` compiled to the whole `dist/index.css`.
 * Without them the consumer's Tailwind emits what it finds in their files.
 */
import { cpSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(fileURLToPath(import.meta.url), "../..");
const source = join(packageRoot, "src");
const target = join(packageRoot, "tw");

/* `cpSync` overwrites but never deletes, so a source file that was renamed or
   removed would linger in `tw/` and ship -- `files` publishes all of it. */
rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });

/* Sources no `/tw` export imports: `files` publishes all of `tw/`, so copied
   they ship as bytes nobody can load. The palette reaches consumers as
   `dist/palette.css`, and the build command in `cli/` as `dist/cli.js`. */
const NOT_FOR_TW = ["palette.css", "theme.compiled.css", "cli"];

for (const entry of NOT_FOR_TW) {
  rmSync(join(target, entry), { recursive: true });
}

/* One directive per line, each terminated with `;`. The horizontal-whitespace
   classes keep the match from eating an adjacent line. */
const SOURCE_NOT = /^[ \t]*@source[ \t]+not[ \t]+(?:"[^"]*"|'[^']*')[ \t]*;?[ \t]*\r?\n?/gm;
const SOURCE_INLINE = /^[ \t]*@source[ \t]+inline\((?:"[^"]*"|'[^']*')\)[ \t]*;?[ \t]*\r?\n?/gm;

for (const relativePath of readdirSync(target, { recursive: true })) {
  if (typeof relativePath !== "string" || !relativePath.endsWith(".css")) {
    continue;
  }

  const file = join(target, relativePath);
  const before = readFileSync(file, "utf8");
  const after = before.replace(SOURCE_NOT, "").replace(SOURCE_INLINE, "");

  if (after !== before) {
    writeFileSync(file, after);
  }
}

/* The `/tw` exports' `types` condition, for the same reason as `dist/index.d.ts`
   in `build-styles.mjs`. */
writeFileSync(join(target, "index.d.ts"), "export {};\n");
