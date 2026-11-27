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

import { classesOf, parse, serialize } from "../src/trim/purge.ts";
import { withHead } from "./head.mjs";
import { VARIANTS } from "./lib/utilities.mjs";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const registry = JSON.parse(readFileSync(path.join(packageRoot, "registry.json"), "utf8"));

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
const completeCss = readFileSync(path.join(packageRoot, "dist/index.css"), "utf8");
const completeTree = parse(completeCss);
const complete = classesOf(completeTree);
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

/* `/tw` ships the `--tw-*` registrations inside its theme, where Tailwind
   keeps them; the compiled build writes them last, so they move there, and a
   page that names every class purges to `dist/index.css` byte for byte. They
   move in its order too, the order its output first needs each one, rather
   than the order `tw/theme.css` lists them in: a utility that sorts earlier
   can change which comes first. */
const REGISTRATION = /@property --tw-[\w-]+\{[^}]*\}/g;
const registrationOrder = (registration) => {
  const index = completeCss.indexOf(registration.slice(0, registration.indexOf("{") + 1));

  return index === -1 ? Infinity : index;
};

/* Tailwind's theme values and Preflight are the copy in `src/base/` that
   `dist/index.css` carries, not those of the Tailwind installed here, which the
   Tailwind workflow moves to the floor of the peer range on purpose. So the
   `theme` and `base` layers are taken from `dist/index.css`: with the catalog's
   Tailwind they are the same bytes, and with another the command still ships
   the package's own. */
const OWN_LAYERS = new Map(
  completeTree
    .filter((node) => node.kind === "group" && /^\s*@layer (?:theme|base)\s*$/.test(node.prelude))
    .map((node) => [node.prelude.trim(), node.children]),
);

const compiler = await createCompiler();
const compiled = serialize(
  parse(optimize(compiler.build([...base, ...variants]), { minify: true }).code).map((node) =>
    node.kind === "group" && OWN_LAYERS.has(node.prelude.trim())
      ? { ...node, children: OWN_LAYERS.get(node.prelude.trim()) }
      : node,
  ),
);
const css = withHead(
  compiled.replace(REGISTRATION, "") +
    (compiled.match(REGISTRATION) ?? []).toSorted((a, b) => registrationOrder(a) - registrationOrder(b)).join(""),
);
const droppable = [...base, ...variants].sort();

mkdirSync(path.join(packageRoot, "dist/purge"), { recursive: true });
writeFileSync(path.join(packageRoot, "dist/purge/index.css"), css);
writeFileSync(path.join(packageRoot, "dist/purge/classes.json"), `${JSON.stringify(droppable)}\n`);
