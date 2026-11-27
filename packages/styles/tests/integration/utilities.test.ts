import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import postcss, { type AtRule } from "postcss";
import { describe, expect, test } from "vitest";

import { classSelector, parse } from "../../src/trim/purge";
import { compile, loadDesignSystem, optimize, POLYFILLS_NONE } from "./tailwind";

/* `dist/utilities.json` is the table the generator writes Tailwind utilities
   from in a project that does not run Tailwind (docs/internal/generator.md).
   It is read from the catalog's Tailwind when the package is built; these
   tests hold it to the consumer's, loaded through `@tailwindcss/cli`
   (`./tailwind.ts`), so the Tailwind workflow fails when another release
   writes a utility, a variant, a theme value, or the order differently. Both
   sides go through that release's minifier, so a value it only spells another
   way is not a difference. */

type Table = {
  tailwind: string;
  variants: Record<string, string>;
  stride: number;
  utilities: Record<string, [rank: number, body: string]>;
  rules: (number | null)[];
  theme: Record<string, string>;
};

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
const table = JSON.parse(await readFile(path.join(packageRoot, "dist/utilities.json"), "utf8")) as Table;
const source = `@import ${JSON.stringify(pathToFileURL(path.join(packageRoot, "tw/index.css")).href)};`;
const design = await loadDesignSystem(source, { base: packageRoot });

const names = Object.keys(table.utilities);
const variants = Object.keys(table.variants);
const withVariants = [...names, ...variants.flatMap((variant) => names.map((name) => `${variant}:${name}`))];
const minified = (css: string) => optimize(css, { minify: true }).code.trim();

const consumerBuild = async (candidates: string[]) => {
  const compiler = await compile(source, {
    base: packageRoot,
    from: path.join(packageRoot, "consumer.css"),
    polyfills: POLYFILLS_NONE,
    onDependency() {},
  });

  return compiler.build(candidates);
};

/* What the generator writes for `candidate`, a utility plain or under one variant. */
function written(candidate: string): string {
  const [variant, name] = candidate.includes(":") ? candidate.split(":") : [undefined, candidate];
  const body = table.utilities[name!]![1];
  const selector = classSelector(candidate);

  return variant === undefined
    ? `${selector}{${body}}`
    : table.variants[variant]!.replaceAll("$s", selector).replaceAll("$b", body);
}

/* The sort key of `candidate`, as the generator reads it from the table. */
function keyOf(candidate: string): number {
  const [variant, name] = candidate.includes(":") ? candidate.split(":") : [undefined, candidate];

  return (variant === undefined ? 0 : variants.indexOf(variant) + 1) * table.stride + table.utilities[name!]![0];
}

describe("dist/utilities.json", () => {
  test("lists the utilities of scripts/lib/utilities.mjs", async () => {
    const { UTILITIES } = (await import("../../scripts/lib/utilities.mjs" as string)) as { UTILITIES: string[] };

    expect(names).toEqual(UTILITIES);
  });

  test("writes each utility as Tailwind does, plain and under each variant", () => {
    const expected = design.candidatesToCss(withVariants);
    const mismatches: string[] = [];

    withVariants.forEach((candidate, index) => {
      const css = expected[index];
      // A utility's `@property` registrations ship with the package's theme, not with the utility.
      const theirs = css === null ? "(none)" : minified(css.replace(/@property [\w-]+\s*\{[^}]*\}/g, ""));
      const ours = minified(written(candidate));

      if (ours !== theirs) {
        mismatches.push(`${candidate}\n  ours:   ${ours}\n  theirs: ${theirs}`);
      }
    });

    expect(mismatches.slice(0, 20).join("\n")).toBe("");
  });

  test("ships the theme values Tailwind writes for the utilities", async () => {
    const css = await consumerBuild(names);
    const values = Object.fromEntries(
      Object.keys(table.theme).map((property) => {
        const value = new RegExp(`${property}:\\s*([^;]+);`).exec(css)?.[1] ?? "(none)";

        return [property, minified(`a{b:${value}}`).replace(/^a\{b:|\}$/g, "")];
      }),
    );

    expect(table.theme).toEqual(values);
  });

  test("ranks the utilities in the order Tailwind writes them", async () => {
    /* Unminified, so each class keeps rules of its own. One `@media` block
       holds the rules of every class that shares it, so each rule counts. */
    const layer = postcss
      .parse(await consumerBuild(withVariants))
      .nodes.find(
        (node): node is AtRule => node.type === "atrule" && node.name === "layer" && node.params === "utilities",
      );
    const known = new Set(withVariants);
    const order: string[] = [];

    layer!.walkRules((rule) => {
      const name = [...rule.selector.matchAll(/\.((?:\\[0-9a-f]+ |\\.|[\w-])+)/g)]
        .map((match) => match[1]!.replace(/^\\3(\d) /, "$1").replaceAll("\\", ""))
        .find((candidate) => known.has(candidate));

      if (name !== undefined && order.at(-1) !== name) {
        order.push(name);
      }
    });

    expect(order).toEqual(withVariants.toSorted((a, b) => keyOf(a) - keyOf(b)));
  });

  test("keys each rule of the package's utilities layer in that order", async () => {
    const css = await readFile(path.join(packageRoot, "dist/purge/index.css"), "utf8");
    const layer = parse(css).find((node) => node.kind === "group" && node.prelude.trim() === "@layer utilities");
    const children = layer?.kind === "group" ? layer.children : [];
    const keyed = table.rules.filter((key) => key !== null);

    expect(table.rules).toHaveLength(children.length);
    expect(keyed).toEqual(keyed.toSorted((a, b) => a - b));
    // A nested layer, such as `utilities.families`, is no class's: no utility is written into it.
    expect(
      children.flatMap((node, index) => (node.kind === "group" && node.prelude.startsWith("@layer") ? [index] : [])),
    ).toEqual(table.rules.flatMap((key, index) => (key === null && children[index]!.kind === "group" ? [index] : [])));
  });
});
