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

/* The colour tokens `src/tokens.css` declares, each the package's public
   surface: every one is listed in `docs/usage/theming.md`'s colour table, and
   every one is read by a rule of the package. `--color-border-hover` was
   documented as the border under the pointer while nothing drew it, and a
   token nothing reads is a promise no test holds. */
const declaredColorTokens = async () => {
  const tokens = await readFile(path.join(packageRoot, "src/tokens.css"), "utf8");

  return [...tokens.matchAll(/^\s*(--color-[a-z0-9-]+)\s*:/gm)].map(([, name]) => name!);
};

test("every colour token tokens.css declares is documented in theming.md", async () => {
  const theming = await readFile(path.join(packageRoot, "docs/usage/theming.md"), "utf8");
  const start = theming.indexOf("## Color tokens");
  const table = theming.slice(start, theming.indexOf("\n## ", start + 1));
  const documented = new Set([...table.matchAll(/^\| `(--[a-z0-9-]+)`/gm)].map(([, name]) => name));
  const declared = await declaredColorTokens();

  expect(declared.length).toBeGreaterThan(30);
  expect(declared.filter((name) => !documented.has(name))).toEqual([]);
  expect([...documented].filter((name) => name.startsWith("--color-") && !declared.includes(name))).toEqual([]);
});

test("every colour token tokens.css declares is read by the package", async () => {
  const { readdir } = await import("node:fs/promises");
  const sourceDirectory = path.join(packageRoot, "src");
  const files = (await readdir(sourceDirectory, { recursive: true })).filter(
    (entry): entry is string => typeof entry === "string" && entry.endsWith(".css") && entry !== "palette.css",
  );
  const source = (await Promise.all(files.map((file) => readFile(path.join(sourceDirectory, file), "utf8")))).join(
    "\n",
  );
  const read = new Set([...source.matchAll(/var\((--color-[a-z0-9-]+)/g)].map(([, name]) => name));

  expect((await declaredColorTokens()).filter((name) => !read.has(name))).toEqual([]);
});

/* `--color-foreground` named a background tone, the opposite of the meaning
   Tailwind and shadcn give `foreground`: `bg-background text-foreground`
   printed neutral-100 on neutral-50, at 1.04:1. */
test("no colour token is named foreground", async () => {
  expect((await declaredColorTokens()).filter((name) => name.includes("foreground"))).toEqual([]);
});
