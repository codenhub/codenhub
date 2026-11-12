/**
 * Writes what `chs build` tree-shakes, into `dist/purge/`:
 *
 * - `index.css`: the complete stylesheet, as `dist/index.css`, plus every axis
 *   and modifier class under each variant in `VARIANTS`, such as `md:lg` and
 *   `hover:primary`.
 * - `classes.json`: the class names the command may drop. Any other class in a
 *   stylesheet is one Tailwind always emits, such as `.theme-dark`, which a
 *   script adds at run time and no template names, so the command keeps it.
 *
 * Tailwind compiles both here, at this package's build, so the command needs
 * no Tailwind where it runs. It reads `tw/` and `dist/index.css`, so it runs
 * after `build-styles.mjs` and `build-tw.mjs`.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { compile, optimize, Polyfills } from "@tailwindcss/node";

import { classesOf, parse } from "../src/cli/purge.ts";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const registry = JSON.parse(readFileSync(path.join(packageRoot, "registry.json"), "utf8"));

/* The variants a class can take without Tailwind. Each costs its copy of every
   class in `variantClasses`, about 3 KB minified for the axis classes alone, so
   the list is the common ones rather than all of Tailwind's: 52 of its variants
   measured 197 KB, and stacking breakpoints on states another 845 KB. A project
   that needs another variant, or two stacked, compiles `/tw` with Tailwind. */
const VARIANTS = ["sm", "md", "lg", "xl", "2xl", "hover", "focus", "focus-visible", "active", "dark"];

/* `disabled` stays markup: it is a state the element is in, which the
   documentation tells consumers to write as the attribute or the class. */
const NO_VARIANT = new Set(["disabled"]);

function createCompiler() {
  return compile(`@import ${JSON.stringify(pathToFileURL(path.join(packageRoot, "tw/index.css")).href)};`, {
    base: packageRoot,
    from: path.join(packageRoot, "purge.css"),
    polyfills: Polyfills.None,
    onDependency() {},
  });
}

/* A class is one the command may drop when it is a Tailwind candidate: naming
   it adds CSS to the build. The compiler keeps every candidate it was given,
   so each class is added to the ones before it and the output compared. Read
   this way rather than from the selectors of an empty build, which name
   component classes inside rules Tailwind always emits. */
const probe = await createCompiler();
const complete = classesOf(parse(readFileSync(path.join(packageRoot, "dist/index.css"), "utf8")));
const base = [];
let size = probe.build([]).length;

for (const name of [...complete].sort()) {
  const next = probe.build([name]).length;

  if (next !== size) {
    base.push(name);
    size = next;
  }
}

const variantClasses = [
  ...Object.keys(registry.intents),
  ...Object.keys(registry.presentation.fill),
  ...Object.keys(registry.presentation.edge),
  ...Object.values(registry.modifiers).flatMap((group) => (Array.isArray(group) ? group : Object.keys(group))),
].filter((name) => base.includes(name) && !NO_VARIANT.has(name));
const variants = VARIANTS.flatMap((variant) => variantClasses.map((name) => `${variant}:${name}`));

const compiler = await createCompiler();
const css = optimize(compiler.build([...base, ...variants]), { minify: true }).code;
const droppable = [...base, ...variants].sort();

mkdirSync(path.join(packageRoot, "dist/purge"), { recursive: true });
writeFileSync(path.join(packageRoot, "dist/purge/index.css"), css);
writeFileSync(path.join(packageRoot, "dist/purge/classes.json"), `${JSON.stringify(droppable)}\n`);
