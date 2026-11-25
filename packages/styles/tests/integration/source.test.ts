import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));

/* The languages a `:where()` list names, in order, from the rule that sets
   `declaration` in `file`. */
const languagesBefore = async (file: string, declaration: string) => {
  const source = await readFile(path.join(packageRoot, file), "utf8");
  const end = source.indexOf(declaration);
  const start = source.lastIndexOf(":where(", end);

  return [...source.slice(start, end).matchAll(/:lang\(([^)]+)\)/g)].map(([, tag]) => tag);
};

/* The languages whose script joins its letters or hangs them from a
   headstroke are listed three times. The type scale and `/native`'s bare
   passages each carry one, since a nested rule in every step cost 2 KB (see
   `typography.rules.css`), and `.chunky-tile-solo` carries one because it
   ships without the type scale. A tag added to one and not the other kept the
   tracking in the place it was left out of. */
test("the type scale, /native and .chunky-tile-solo name the same untracked languages", async () => {
  const scale = await languagesBefore("src/typography.rules.css", "--_script-tracking: normal");
  const native = await languagesBefore("src/native.css", "letter-spacing: normal");

  expect(scale.length).toBeGreaterThan(0);
  expect(native).toEqual(scale);
  expect(await languagesBefore("src/aesthetics/chunky-tile.css", "letter-spacing: normal")).toEqual(scale);
  expect(new Set(scale).size, "no tag twice").toBe(scale.length);
});

/* Vite's `build.license` collects each package's `LICENSE` and never reads
   `NOTICE`, so `LICENSE` ends with a copy of it. An edit to one and not the
   other left a Vite build carrying the old third-party notices. */
test("LICENSE ends with NOTICE", async () => {
  const [license, notice] = await Promise.all(
    ["LICENSE", "NOTICE"].map((file) => readFile(path.join(packageRoot, file), "utf8")),
  );

  expect(license.endsWith(notice)).toBe(true);
});

/* A control is disabled four ways, and `box` dims every one: `:disabled`,
   `.disabled`, `aria-disabled="true"`, and `data-disabled`. A selector that
   named `:disabled` alone answered one of them, so a field disabled by
   `aria-disabled` inside an `.input-group` dimmed only itself and the group
   kept its hover. Every selector naming `:disabled` names the other three
   with it, in the comma list `:disabled` sits in. */
test("every selector that names :disabled names every disabled spelling", async () => {
  const { readdir } = await import("node:fs/promises");
  const files = (await readdir(path.join(packageRoot, "src"), { recursive: true })).filter((file) =>
    file.endsWith(".css"),
  );
  const spellings = [".disabled", '[aria-disabled="true"]', "[data-disabled]"];
  const lonely: string[] = [];

  for (const file of files) {
    // oxlint-disable-next-line no-await-in-loop -- a few dozen small files, read in turn.
    const source = (await readFile(path.join(packageRoot, "src", file), "utf8")).replaceAll(/\/\*[\s\S]*?\*\//g, "");

    for (const { index } of source.matchAll(/:disabled\b/g)) {
      /* The selector the match sits in: from the end of the previous rule or
         declaration to the brace that opens its block. */
      const start = Math.max(...["{", "}", ";"].map((mark) => source.lastIndexOf(mark, index))) + 1;
      const selector = source.slice(start, source.indexOf("{", index));

      if (!spellings.every((spelling) => selector.includes(spelling))) {
        lonely.push(`${file}: ${selector.replaceAll(/\s+/g, " ").trim()}`);
      }
    }
  }

  expect(lonely).toEqual([]);
});
