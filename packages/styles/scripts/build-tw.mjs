/**
 * Copies `src/` to `dist/tw/` for the source (`/tw`) entrypoints, dropping the
 * `@source not "..."` directives on the way.
 *
 * Those excludes name directories relative to `src/` -- `../dist`, `../demo`,
 * `../playground`, and so on -- so once a file sits at `dist/tw/` each one
 * resolves to a path that does not exist (`dist/dist`, `dist/demo`) and does
 * nothing in a consumer's Tailwind build. They have no job there either: a
 * `/tw` consumer scans their own `@source`, not this package's tree.
 *
 * `@source inline(...)` is left in place -- it safelists the utility class names
 * a `/tw` consumer needs and is load-bearing.
 */
import { cpSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(fileURLToPath(import.meta.url), "../..");
const source = join(packageRoot, "src");
const target = join(packageRoot, "dist", "tw");

/* `cpSync` overwrites but never deletes, so a source file that was renamed or
   removed would linger in `dist/tw/` and ship -- `files` publishes all of
   `dist`. The full `build` clears `dist/` first; clearing here too makes a bare
   `build:tw` just as safe. */
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
