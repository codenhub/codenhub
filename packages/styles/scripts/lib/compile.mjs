/**
 * Compiles one entrypoint of `src/` into the finished stylesheet `dist/`
 * ships. The source is CSS, with nesting, `@layer`, and custom properties,
 * plus `@compose`, the one directive of this package's own. This module turns
 * it into what a browser reads, and into what a consumer's Tailwind emits when
 * it compiles the same classes from `/tw`, byte for byte:
 * `tests/integration/adapter.test.ts` holds the two paths to each other.
 *
 * - `@import` is inlined, wrapped in `@layer` when it names one. A file is
 *   inlined once per entry; a second import of it is an error, except for
 *   Tailwind's theme values, which every focused entry imports.
 * - A utility is a rule directly in `@layer utilities` whose selector is one
 *   class. They are lifted out of their files, sorted as Tailwind sorts them
 *   (see `sort.mjs`), and written where `base/utilities.css` is imported, the
 *   place `tailwindcss/utilities.css` holds on the `/tw` path.
 * - `@compose a b;` copies the bodies of utilities `a` and `b` in its place, in
 *   the order written. `&` in a copied nested rule then means the composing
 *   rule. A name is any utility in `src/`, whatever the entry imports.
 * - A declaration repeated later in the same rule, with the same value, is
 *   dropped, as Tailwind drops it.
 * - Tailwind's theme values (`base/theme.css`) are kept only where the output
 *   reads them, and its `@property --tw-*` registrations (`base/properties.css`)
 *   only where the output needs them, as Tailwind keeps both.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import postcss from "postcss";

import { minify } from "./minify.mjs";
import { compareUtilities, propertySort } from "./sort.mjs";

/* The Tailwind CSS release `src/base/` is copied from. Its banner heads every
   entry that carries any of that copy, as Tailwind heads every entry it
   compiles. */
export const TAILWIND_VERSION = "4.3.4";
const BANNER = `/*! tailwindcss v${TAILWIND_VERSION} | MIT License | https://tailwindcss.com */\n`;

const UTILITY = /^\.[A-Za-z0-9_-]+$/;

export function createCompiler(sourceRoot) {
  const base = path.join(sourceRoot, "base");
  const themeValues = path.join(base, "theme.css");
  const placeholder = path.join(base, "utilities.css");
  const properties = parseRegistrations(path.join(base, "properties.css"));
  const library = readLibrary(sourceRoot);

  return {
    compile: (entry, options) => compileEntry(entry, options),
    /* Replaces every `@compose` under `node` with what it copies. */
    expand(node) {
      node.walkAtRules("compose", (composition) => composition.replaceWith(composed(composition)));
    },
    /* The definition of the utility `name`, or `undefined`. */
    utility: (name) => library.get(name),
    isUtility,
  };

  function compileEntry(entry, { omit = () => false } = {}) {
    const files = new Set();
    const root = postcss.root();

    root.append(...inline(entry, files));

    /* The entry's own utilities, lifted out of the tree. */
    const utilities = [];

    root.walkRules((rule) => {
      if (!isUtility(rule)) {
        return;
      }

      const name = rule.selector.slice(1);
      const file = rule.source.input.file;
      const container = rule.parent;

      rule.remove();
      removeIfEmpty(container);

      if (!omit({ name, file: path.relative(sourceRoot, file).replaceAll("\\", "/") })) {
        utilities.push(rule);
      }
    });

    root.walk((node) => {
      if (node.type === "atrule" && node.name === "compose") {
        node.replaceWith(composed(node));
      }
    });

    for (const rule of utilities) {
      rule.walkAtRules("compose", (node) => node.replaceWith(composed(node)));
    }

    placeUtilities(root, utilities, entry);
    dropRepeatedDeclarations(root);
    mergeThemeBlocks(root);
    pruneThemeValues(root);
    root.append(...registrationsFor(root, properties));

    const css = minify(root.toString(), path.relative(sourceRoot, entry));

    return [...files].some((file) => file.startsWith(base + path.sep)) ? BANNER + css : css;
  }

  function inline(file, files) {
    if (files.has(file)) {
      if (file === themeValues) {
        return [];
      }

      throw new Error(`${file} is imported twice in one entry`);
    }

    files.add(file);

    if (file === placeholder) {
      return [postcss.comment({ text: "utilities" })];
    }

    const root = postcss.parse(readFileSync(file, "utf8"), { from: file });

    // oxlint-disable-next-line unicorn/no-useless-spread -- the loop replaces nodes of `root.nodes`, so it walks a copy.
    for (const node of [...root.nodes]) {
      if (node.type !== "atrule" || node.name !== "import") {
        continue;
      }

      const match = node.params.match(/^(["'])(.+?)\1\s*(?:layer\(([\w.-]+)\))?$/);

      if (!match || !match[2].startsWith(".")) {
        throw new Error(`${file}: cannot import ${node.params}`);
      }

      const nodes = inline(path.resolve(path.dirname(file), match[2]), files);

      if (match[3]) {
        node.replaceWith(postcss.atRule({ name: "layer", params: match[3], nodes }));
      } else if (nodes.length > 0) {
        node.replaceWith(nodes);
      } else {
        node.remove();
      }
    }

    return root.nodes;
  }

  function composed(node, stack = []) {
    const names = node.params.trim().split(/\s+/);

    return names.flatMap((name) => {
      const definition = library.get(name);

      if (!definition) {
        throw new Error(`${location(node)}: @compose ${name}: no utility of that name in src/`);
      }

      if (stack.includes(name)) {
        throw new Error(`${location(node)}: @compose ${[...stack, name].join(" -> ")} is a cycle`);
      }

      const body = definition.clone();

      /* The copy's comments explain the utility it came from, where they
         already stand; `tw/` would otherwise repeat them in every composer. */
      body.walkComments((comment) => comment.remove());

      body.walkAtRules("compose", (inner) => inner.replaceWith(composed(inner, [...stack, name])));

      return body.nodes;
    });
  }
}

function isUtility(rule) {
  const parent = rule.parent;

  return (
    parent?.type === "atrule" && parent.name === "layer" && parent.params === "utilities" && UTILITY.test(rule.selector)
  );
}

/* Every utility in `src/`, by name, for `@compose`: a utility composes from
   any file, as `@apply` reached any class, without the entry importing it. */
function readLibrary(sourceRoot) {
  const library = new Map();

  for (const relative of readdirSync(sourceRoot, { recursive: true })) {
    if (typeof relative !== "string" || !relative.endsWith(".css")) {
      continue;
    }

    const file = path.join(sourceRoot, relative);

    postcss.parse(readFileSync(file, "utf8"), { from: file }).walkRules((rule) => {
      if (!isUtility(rule)) {
        return;
      }

      const name = rule.selector.slice(1);

      if (library.has(name)) {
        throw new Error(`${location(rule)}: utility ${name} is also defined in ${library.get(name).source.input.file}`);
      }

      library.set(name, rule);
    });
  }

  return library;
}

function placeUtilities(root, utilities, entry) {
  let marker;

  root.walkComments((comment) => {
    if (comment.text === "utilities" && !comment.source) {
      marker = comment;
    }
  });

  if (!marker) {
    if (utilities.length > 0) {
      throw new Error(`${entry} defines utilities but does not import base/utilities.css`);
    }

    return;
  }

  const sorted = utilities
    .map((rule) => ({ rule, variants: 0n, properties: propertySort(rule.nodes), name: rule.selector.slice(1) }))
    .sort(compareUtilities)
    .map(({ rule }) => rule);

  marker.replaceWith(sorted);
}

function removeIfEmpty(node) {
  if (node.type === "atrule" && node.nodes.every((child) => child.type === "comment")) {
    node.remove();
  }
}

/* Tailwind keeps the last of two equal declarations in one rule, nested rules
   between them notwithstanding: `.a { width: 100%; @compose b; }` where `b`
   also sets `width: 100%` keeps `b`'s. */
function dropRepeatedDeclarations(root) {
  root.walk((node) => {
    if (!node.nodes) {
      return;
    }

    const seen = new Set();

    for (const child of [...node.nodes].reverse()) {
      if (child.type !== "decl") {
        continue;
      }

      const key = `${child.prop}\0${child.value}\0${child.important}`;

      if (seen.has(key)) {
        child.remove();
      } else {
        seen.add(key);
      }
    }
  });
}

/* Tailwind writes all its theme values, then the package's tokens, as one
   `:root, :host` rule in `theme`. The two files write a rule each. */
function mergeThemeBlocks(root) {
  const blocks = [];

  root.walkRules((rule) => {
    const file = rule.source?.input.file;

    if (/^:root,\s*:host$/.test(rule.selector) && file && isThemeFile(file)) {
      blocks.push(rule);
    }
  });

  const [first, ...rest] = blocks;

  for (const rule of rest) {
    first.append(...rule.nodes);
    const container = rule.parent;
    rule.remove();
    removeIfEmpty(container);
  }
}

function isThemeFile(file) {
  const normalized = file.replaceAll("\\", "/");

  return normalized.endsWith("/base/theme.css") || normalized.endsWith("/tokens.css");
}

/* A Tailwind theme value is kept where something kept reads it, including
   another kept value. */
function pruneThemeValues(root) {
  const values = new Map();
  const reads = [];

  root.walkDecls((decl) => {
    if (decl.source?.input.file.replaceAll("\\", "/").endsWith("/base/theme.css")) {
      values.set(decl.prop, decl);
    } else {
      reads.push(decl.value);
    }
  });

  const kept = new Set();
  const pending = [...reads];

  while (pending.length > 0) {
    for (const [, name] of pending.pop().matchAll(/var\(\s*(--[\w-]+)/g)) {
      if (values.has(name) && !kept.has(name)) {
        kept.add(name);
        pending.push(values.get(name).value);
      }
    }
  }

  for (const [name, decl] of values) {
    if (!kept.has(name)) {
      decl.remove();
    }
  }
}

function parseRegistrations(file) {
  const registrations = new Map();

  postcss.parse(readFileSync(file, "utf8"), { from: file }).walkAtRules("property", (rule) => {
    registrations.set(rule.params.trim(), rule);
  });

  return registrations;
}

/* Tailwind registers a `--tw-*` property for a utility that sets it, so that
   it does not inherit, and for one that reads it with the registration's
   initial value as the default. Each comes once, at the end, in the order the
   output first needs it. */
function registrationsFor(root, registrations) {
  const needed = new Set();

  root.walkDecls((decl) => {
    if (registrations.has(decl.prop)) {
      needed.add(decl.prop);
    }

    for (const [, name] of decl.value.matchAll(/var\(\s*(--tw-[\w-]+)/g)) {
      if (registrations.get(name)?.nodes.some((child) => child.prop === "initial-value")) {
        needed.add(name);
      }
    }
  });

  return [...needed].map((name) => registrations.get(name).clone());
}

function location(node) {
  return `${node.source?.input.file}:${node.source?.start?.line}`;
}
