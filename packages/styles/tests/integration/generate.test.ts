import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import postcss, { type Container, type Rule } from "postcss";
import { describe, expect, test } from "vitest";

import { generate, readUtilities } from "../../src/trim/generate";
import { readDroppable, usedClasses } from "../../src/trim/index";
import { classSelector, type Node, parse, purge, serialize } from "../../src/trim/purge";
import { compile, optimize, POLYFILLS_NONE } from "./tailwind";

/* The generator writes a utility where Tailwind sorts it among the package's
   own rules when it compiles `/tw` (docs/internal/generator.md, "Where a
   utility sits in the cascade"), so `class="btn mt-4"` resolves the same on
   both paths. These tests build a page both ways, the generator's from the
   package's `dist/`, Tailwind's with the consumer's release (`./tailwind.ts`),
   and hold each utility to the same side of every package rule it could meet. */

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
const source = `@import ${JSON.stringify(pathToFileURL(path.join(packageRoot, "tw/index.css")).href)};`;
const purgeTree = parse(await readFile(path.join(packageRoot, "dist/purge/index.css"), "utf8"));
const utilities = await readUtilities();
const droppable = await readDroppable();

const PAGES = {
  "a button with a margin, and a breakpoint on each": ["btn", "mt-4", "md:flex", "md:primary"],
  "a layout of the package's helpers and utilities": [
    "card",
    "stack",
    "cluster",
    "auto-grid",
    "section",
    "section-content",
    "divider",
    "visually-hidden",
    "badge",
    "kbd",
    "ipt",
    "input-group",
    "field",
    "text-title",
    "text-body",
    "btn",
    "lg",
    "p-4",
    "px-2",
    "gap-2",
    "gap-4",
    "flex",
    "grid",
    "grid-cols-3",
    "hidden",
    "w-full",
    "max-w-md",
    "mx-auto",
    "relative",
    "absolute",
    "inset-0",
    "overflow-hidden",
    "text-center",
    "text-lg",
    "font-bold",
    "leading-tight",
    "md:hidden",
    "sm:p-2",
    "lg:grid-cols-4",
    "hover:underline",
    "dark:block",
    "focus:relative",
    "md:lg",
  ],
};

/* The rules of a utilities layer, in order, one entry for each selector, with
   the at-rules around it inside the layer; a nested layer is left out, since
   no utility is written into it. */
function selectorsIn(layer: Container): string[] {
  const order: string[] = [];

  layer.walkRules((rule: Rule) => {
    const context: string[] = [];

    for (
      let parent: postcss.Node["parent"] = rule.parent;
      parent !== undefined && parent !== layer;
      parent = parent.parent
    ) {
      if (parent.type === "atrule") {
        if ((parent as postcss.AtRule).name === "layer") {
          return;
        }
        context.unshift(`@${(parent as postcss.AtRule).name} ${(parent as postcss.AtRule).params}`);
      }
    }
    for (const selector of rule.selectors) {
      order.push([...context, selector].join(" "));
    }
  });

  return order;
}

const utilitiesLayer = (css: string) => {
  let found: Container | undefined;

  postcss.parse(css).walkAtRules("layer", (layer) => {
    found ??= layer.params === "utilities" ? layer : undefined;
  });

  return found!;
};

// The selectors of the package's rules a utility's place matters to: those the table keys.
const keyed = (() => {
  const layer = purgeTree.find((node) => node.kind === "group" && node.prelude.trim() === "@layer utilities");
  const children = layer?.kind === "group" ? layer.children : [];
  const nodes = children.filter((_, index) => utilities.table.rules[index] !== null);

  return new Set(selectorsIn(utilitiesLayer(`@layer utilities{${serialize(nodes as Node[])}}`)));
})();

async function tailwindBuild(page: string[]): Promise<string> {
  const compiler = await compile(source, {
    base: packageRoot,
    from: path.join(packageRoot, "page.css"),
    polyfills: POLYFILLS_NONE,
    onDependency() {},
  });

  return optimize(compiler.build(page), { minify: true }).code;
}

describe("the generator", () => {
  test.each(Object.entries(PAGES))(
    "writes each utility of %s on the side of each package rule Tailwind does",
    async (_, page) => {
      const ours = selectorsIn(
        utilitiesLayer(serialize(purge(generate(purgeTree, page, utilities), usedClasses(new Set(page), droppable)))),
      );
      const theirs = selectorsIn(utilitiesLayer(await tailwindBuild(page)));
      const written = page.filter((name) => utilities.names.has(name));
      // The utility a rule the generator wrote starts with, as `.md\:flex` or `.hover\:underline:hover`.
      const names = (entry: string) => {
        const selector = entry.replace(/^@.*? (?=\.)/, "");

        return written.find((name) =>
          new RegExp(String.raw`^${RegExp.escape(classSelector(name))}(?![\w\\-])`).test(selector),
        );
      };
      const utility = (entry: string) => names(entry) !== undefined;
      const ownRules = ours.filter((entry) => keyed.has(entry) && theirs.includes(entry));
      const mismatches: string[] = [];

      for (const entry of ours.filter(utility)) {
        expect(theirs).toContain(entry);

        for (const rule of ownRules) {
          const before = ours.indexOf(entry) < ours.indexOf(rule);

          if (before !== theirs.indexOf(entry) < theirs.indexOf(rule)) {
            mismatches.push(`${entry} ${before ? "before" : "after"} ${rule}`);
          }
        }
      }

      // `dark:` writes two rules, one for the class and one for the system setting.
      expect(written.filter((name) => !ours.some((entry) => names(entry) === name))).toEqual([]);
      expect(ownRules.length).toBeGreaterThan(0);
      expect(mismatches.slice(0, 20)).toEqual([]);
    },
  );

  test("adds the theme values the utilities read and the source lacks, once", () => {
    const css = serialize(generate(purgeTree, ["max-w-md", "md:max-w-md", "text-2xl"], utilities));

    expect(css.match(/--container-md:28rem/g)).toHaveLength(1);
    expect(css).toContain("--text-2xl:1.5rem;--text-2xl--line-height:calc(2 / 1.5)");
    expect(css).not.toContain("--container-lg");
  });

  test("leaves the source as it was for a page that names no utility", () => {
    expect(serialize(generate(purgeTree, ["btn", "md:primary", "mt-13"], utilities))).toBe(serialize(purgeTree));
  });
});
