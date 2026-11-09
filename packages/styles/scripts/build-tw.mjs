/**
 * Copies `src/` to `tw/` for the source (`/tw`) entrypoints, dropping the
 * `@source not "..."` directives on the way.
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
 * `@source inline(...)` is left in place -- it safelists the utility class names
 * a `/tw` consumer needs and is load-bearing.
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

/* One directive per line, each terminated with `;`. The horizontal-whitespace
   classes keep the match from eating an adjacent line. */
const SOURCE_NOT = /^[ \t]*@source[ \t]+not[ \t]+(?:"[^"]*"|'[^']*')[ \t]*;?[ \t]*\r?\n?/gm;

for (const relativePath of readdirSync(target, { recursive: true })) {
  if (typeof relativePath !== "string" || !relativePath.endsWith(".css")) {
    continue;
  }

  const file = join(target, relativePath);
  const before = readFileSync(file, "utf8");
  const after = before.replace(SOURCE_NOT, "");

  if (after !== before) {
    writeFileSync(file, after);
  }
}
