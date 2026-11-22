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
