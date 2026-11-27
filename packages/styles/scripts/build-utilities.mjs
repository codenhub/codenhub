/**
 * Writes `dist/utilities.json`, the table the generator writes Tailwind
 * utilities from in a project that does not run Tailwind
 * (`docs/internal/generator.md`):
 *
 * - `variants`: the variants in Tailwind's order, each with the CSS it wraps a
 *   utility in, where `$s` stands for the selector and `$b` for the body.
 * - `utilities`: each utility of `lib/utilities.mjs`, as `[rank, body]`.
 * - `classes`: the rank of each class of the package's own that `chs build`
 *   may drop, so a utility is merged among them in Tailwind's order.
 * - `theme`: the theme values the utilities read that `dist/purge/index.css`
 *   does not declare, such as `--container-md`.
 *
 * A rank is the class's position in the order Tailwind writes the utilities
 * layer in when it compiles `/tw`, with no variant. A class under a variant
 * sorts after every class without one, by the variant's position, then by the
 * rank of its class, as Tailwind sorts it.
 *
 * Everything is read from Tailwind compiling `/tw`, at this package's build,
 * so the generator needs no Tailwind where it runs, and no value is typed by
 * hand. It runs after `build-purge.mjs`, whose output it reads.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { __unstable__loadDesignSystem, compile, optimize, Polyfills } from "@tailwindcss/node";
import postcss from "postcss";

import { classesOf, classSelector, parse, splitTop } from "../src/trim/purge.ts";
import { TAILWIND_VERSION } from "./lib/compile.mjs";
import { UTILITIES, VARIANTS } from "./lib/utilities.mjs";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

/* The values are frozen to the Tailwind release `src/base/` is copied from,
   so moving to another one is a change that copies `src/base/` again and
   takes the new values on purpose (generator.md, "Tailwind changing a
   value"). */
const tailwindManifest = createRequire(createRequire(import.meta.url).resolve("@tailwindcss/node")).resolve(
  "tailwindcss/package.json",
);
const installed = JSON.parse(readFileSync(tailwindManifest, "utf8")).version;

if (installed !== TAILWIND_VERSION) {
  throw new Error(
    `build-utilities: @tailwindcss/node compiles with Tailwind ${installed}, but src/base/ is copied from ${TAILWIND_VERSION}. Copy src/base/ from ${installed} and move TAILWIND_VERSION in scripts/lib/compile.mjs with it.`,
  );
}

const duplicates = UTILITIES.filter((name, index) => UTILITIES.indexOf(name) !== index);

if (duplicates.length > 0) {
  throw new Error(`build-utilities: listed twice in scripts/lib/utilities.mjs: ${duplicates.join(", ")}`);
}

const source = `@import ${JSON.stringify(pathToFileURL(path.join(packageRoot, "tw/index.css")).href)};`;
const purgeCss = readFileSync(path.join(packageRoot, "dist/purge/index.css"), "utf8");
const droppable = JSON.parse(readFileSync(path.join(packageRoot, "dist/purge/classes.json"), "utf8"));
const own = droppable.filter((name) => !name.includes(":"));

/* A utility with the name of a class of the package's would leave the scan
   unable to tell which one a template means. */
const packageClasses = classesOf(parse(purgeCss));
const taken = UTILITIES.filter((name) => packageClasses.has(name));

if (taken.length > 0) {
  throw new Error(`build-utilities: these utilities are classes of the package's own: ${taken.join(", ")}`);
}

const design = await __unstable__loadDesignSystem(source, { base: packageRoot });
const minified = (css) => optimize(css, { minify: true }).code.trim();
const escape = classSelector;

/* The `--tw-*` properties `tw/theme.css` registers. A utility that sets
   another would have to ship its registration too, so none is listed
   (generator.md, "The list, and how it is checked"). */
const registered = new Set(
  [...readFileSync(path.join(packageRoot, "tw/theme.css"), "utf8").matchAll(/@property (--tw-[\w-]+)/g)].map(
    (match) => match[1],
  ),
);

const bodies = new Map();
const css = design.candidatesToCss(UTILITIES);

UTILITIES.forEach((name, index) => {
  if (css[index] === null) {
    throw new Error(`build-utilities: Tailwind ${TAILWIND_VERSION} compiles no "${name}"`);
  }

  const root = postcss.parse(css[index]);
  const rules = root.nodes.filter((node) => node.type !== "atrule" || node.name !== "property");

  if (rules.length !== 1 || rules[0].type !== "rule" || rules[0].selector !== escape(name)) {
    throw new Error(`build-utilities: "${name}" is not one rule on its class:\n${css[index]}`);
  }

  for (const node of rules[0].nodes) {
    if (node.type !== "decl") {
      throw new Error(`build-utilities: "${name}" nests a rule:\n${css[index]}`);
    }
    if (node.prop.startsWith("--tw-") && !registered.has(node.prop)) {
      throw new Error(`build-utilities: "${name}" sets ${node.prop}, which tw/theme.css does not register`);
    }
  }

  const body = minified(`${escape(name)}{${rules[0].nodes.join(";")}}`).replace(/^[^{]*\{|\}$/g, "");
  bodies.set(name, body);
});

/* Each wrapper is read from the variant applied to `flex`, so it is
   Tailwind's own, minified as the rest of the table is. */
const PROBE = "display:flex";
const variantCss = design.candidatesToCss(VARIANTS.map((variant) => `${variant}:flex`));
const wrappers = VARIANTS.map((variant, index) => {
  const wrapper = minified(variantCss[index]);

  if (!wrapper.includes(escape(`${variant}:flex`)) || !wrapper.includes(PROBE)) {
    throw new Error(`build-utilities: the "${variant}" variant does not wrap its class as expected:\n${wrapper}`);
  }

  return [variant, wrapper.replaceAll(escape(`${variant}:flex`), "$s").replaceAll(PROBE, "$b")];
});

/* One order for the package's classes and the utilities together: Tailwind's
   when it compiles `/tw`. `getClassOrder` is what Tailwind sorts candidates by;
   `tests/integration/utilities.test.ts` holds it to the order a build writes. */
const order = new Map(
  design
    .getClassOrder([...own, ...UTILITIES])
    .toSorted((a, b) => (a[1] === b[1] ? 0 : a[1] < b[1] ? -1 : 1))
    .map(([name], rank) => [name, rank]),
);

/* The variants in Tailwind's order: the order it writes one class under each. */
const variantRank = new Map(design.getClassOrder(VARIANTS.map((variant) => `${variant}:flex`)));
const sortedVariants = wrappers.toSorted(([a], [b]) =>
  variantRank.get(`${a}:flex`) < variantRank.get(`${b}:flex`) ? -1 : 1,
);

/* A class's sort key, one number: its rank without a variant, and past every
   class without one under a variant, by the variant's place, then the rank. */
const stride = order.size;
const keyOf = (candidate) => {
  const colon = candidate.indexOf(":");

  return colon === -1
    ? order.get(candidate)
    : (sortedVariants.findIndex(([variant]) => variant === candidate.slice(0, colon)) + 1) * stride +
        order.get(candidate.slice(colon + 1));
};

/* The key of each rule `dist/purge/index.css` holds directly in its utilities
   layer, in order. A rule's selector does not say which class wrote it, since
   `.input-group .ipt` is written by `ipt`, so each class is compiled alone and
   its selectors kept. A rule Lightning CSS merged from two neighbours takes
   the first one's key; a rule no class wrote, such as the plain rules of
   `tw/`, and a nested layer, which no utility joins, take `null`. */
const owner = new Map();
const selectorsOf = (nodes, into = []) => {
  for (const node of nodes) {
    if (node.kind === "block" && node.isRule) {
      into.push(...splitTop(node.prelude, ",").map((selector) => selector.trim()));
    } else if (node.kind === "group") {
      selectorsOf(node.children, into);
    }
  }

  return into;
};

design.candidatesToCss(droppable).forEach((css, index) => {
  for (const selector of selectorsOf(parse(css === null ? "" : minified(css)))) {
    const key = keyOf(droppable[index]);

    owner.set(selector, Math.min(owner.get(selector) ?? Infinity, key));
  }
});

/* A rule Tailwind writes with no class named is no class's, even where a
   class writes the same selector too, as `input-group` does. */
/* `@import "tailwindcss"` in `tw/` resolves from this package, which the
   Tailwind workflow moves to the consumer's release; the theme values are read
   from the release checked above instead, the one `src/base/` is copied from. */
const tailwindRoot = path.dirname(tailwindManifest);
const compiler = await compile(source, {
  base: packageRoot,
  from: path.join(packageRoot, "utilities.css"),
  polyfills: Polyfills.None,
  onDependency() {},
  customCssResolver: async (id) => {
    if (id === "tailwindcss") {
      return path.join(tailwindRoot, "index.css");
    }

    return id.startsWith("tailwindcss/") ? path.join(tailwindRoot, id.slice("tailwindcss/".length)) : undefined;
  },
});

const findUtilities = (css) =>
  parse(css).find((node) => node.kind === "group" && node.prelude.trim() === "@layer utilities");

for (const selector of selectorsOf(findUtilities(minified(compiler.build([]))).children)) {
  owner.delete(selector);
}

const utilitiesLayer = findUtilities(purgeCss);
const rules = utilitiesLayer.children.map((node) => {
  if (node.kind === "group" && node.prelude.trim().startsWith("@layer")) {
    return null;
  }

  const keys = selectorsOf([node]).map((selector) => owner.get(selector) ?? Infinity);
  const key = Math.min(...keys);

  return key === Infinity ? null : key;
});

const keyed = rules.filter((key) => key !== null);

if (keyed.some((key, index) => index > 0 && key < keyed[index - 1])) {
  throw new Error("build-utilities: the keys of dist/purge/index.css's utilities layer are not in Tailwind's order");
}

/* The theme values the utilities read, from the theme layer Tailwind writes
   for them. A value `dist/purge/index.css` declares must be Tailwind's, or the
   two paths would size the same class differently. */
const tailwindTheme = new Map();

postcss.parse(compiler.build(UTILITIES)).walkAtRules("layer", (layer) => {
  if (layer.params === "theme") {
    layer.walkDecls((decl) => tailwindTheme.set(decl.prop, decl.value));
  }
});

const purgeTheme = new Map();

postcss.parse(purgeCss).walkAtRules("layer", (layer) => {
  if (layer.params === "theme") {
    layer.each((node) => {
      if (node.type === "rule") {
        node.each((decl) => decl.type === "decl" && purgeTheme.set(decl.prop, decl.value));
      }
    });
  }
});

const read = new Set([...bodies.values()].flatMap((body) => [...body.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1])));
const theme = {};

for (const property of [...read].sort()) {
  if (!tailwindTheme.has(property)) {
    continue;
  }

  const value = minified(`a{${property}:${tailwindTheme.get(property)}}`).replace(/^a\{[^:]+:|\}$/g, "");

  if (!purgeTheme.has(property)) {
    theme[property] = value;
  } else if (purgeTheme.get(property) !== value) {
    throw new Error(
      `build-utilities: ${property} is ${purgeTheme.get(property)} in dist/purge/index.css and ${value} in Tailwind ${TAILWIND_VERSION}`,
    );
  }
}

const table = {
  tailwind: TAILWIND_VERSION,
  variants: Object.fromEntries(sortedVariants),
  stride,
  utilities: Object.fromEntries(UTILITIES.map((name) => [name, [order.get(name), bodies.get(name)]])),
  rules,
  theme,
};

writeFileSync(path.join(packageRoot, "dist/utilities.json"), `${JSON.stringify(table)}\n`);
