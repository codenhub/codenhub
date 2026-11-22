import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

// The generator's module, untyped JavaScript.
const languagesSpecifier = "../../scripts/lib/script-languages.mjs";
const { CARRIED_LANGUAGES, cldrLanguages, untrackedLanguages } = (await import(languagesSpecifier)) as {
  CARRIED_LANGUAGES: string[];
  cldrLanguages(): string[];
  untrackedLanguages(): string[];
};

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

/* The list was written by hand and grown by example, and an audit still found
   languages missing from it. It is generated now, from the CLDR the
   running Node.js carries; the list records the CLDR it was generated from,
   and a Node.js with another one, such as the floor's, skips the comparison
   rather than reporting the difference between two CLDR releases as drift. */
test("the untracked languages are every tag CLDR's likely subtags put in those scripts", async (context) => {
  const source = await readFile(path.join(packageRoot, "src/typography.rules.css"), "utf8");
  const recorded = /CLDR (\S+?),/.exec(source)?.[1];

  expect(recorded, "the list names its CLDR").toBeDefined();
  context.skip(recorded !== process.versions.cldr, `generated from CLDR ${recorded}, running ${process.versions.cldr}`);

  const scale = await languagesBefore("src/typography.rules.css", "--_script-tracking: normal");

  expect(scale).toEqual(untrackedLanguages());
  for (const tag of [
    "mni",
    "gom",
    "awa",
    "mag",
    "hne",
    "raj",
    "mwr",
    "bgc",
    "ota",
    "ha-Arab",
    "ky-Arab",
    "aii",
    "mnc",
  ]) {
    expect(scale).toContain(tag);
  }
});

/* A tag carried over from the hand-written list is one CLDR's likely subtags
   cannot show, since it resolves to the region its language does. Once they
   do, it is CLDR's, and the carried copy goes. */
test("a carried language is one CLDR's likely subtags do not name", () => {
  const cldr = new Set(cldrLanguages());

  expect(CARRIED_LANGUAGES.filter((tag) => cldr.has(tag))).toEqual([]);
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
