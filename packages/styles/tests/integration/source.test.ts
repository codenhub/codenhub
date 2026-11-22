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
