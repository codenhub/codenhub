import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import postcss from "postcss";
import { describe, expect, test } from "vitest";

import { compile, optimize, POLYFILLS_NONE } from "./tailwind";

/* `dist/` is compiled by the package's own build and `/tw` by the consumer's
   Tailwind, from the same `src/`. They must agree: a class a `/tw` consumer
   compiles is the class the compiled stylesheet ships, rule for rule and in the
   same order, which the overrides in docs/internal/model.md#cascade-layers are
   tuned to. So each compiled entry is compiled again from its `/tw`
   counterpart, naming every utility it ships, and the two compared.

   Four differences are by design. Tailwind heads every build with its banner,
   and the compiled build only an entry that carries some of Tailwind's own
   CSS. A complete compiled stylesheet starts with the package's head comment,
   which `chs build` reads (`scripts/head.mjs`), and `/tw` carries none.
   `/tw` ships all nine `--tw-*` registrations the package's bodies need, where the compiled build writes those its output uses: both are
   compared as sets, the compiled one inside the other. And Tailwind writes a
   `@theme` on `:root, :host`, where the compiled build writes its tokens on
   `:root` alone, so a shadow root inherits the page's overrides (see
   `src/tokens.css`): that selector is compared as `:root`.

   On the catalog's Tailwind, the one `src/base/` is copied from, the rest is
   byte for byte. On another release, as the Tailwind workflow runs, Tailwind's
   own theme values and Preflight are that release's, so `theme` and `base` are
   left out and the package's components and utilities compared alone, and the
   Lightning CSS that release runs may spell a value another way. The compiler
   is the consumer's, loaded through `@tailwindcss/cli` (`./tailwind.ts`). */

type Entry = {
  output: string;
  omit?: (utility: { name: string; file: string }) => boolean;
  tw: string[] | null;
};

// The build's own modules, untyped JavaScript.
const entriesSpecifier = "../../scripts/lib/entries.mjs";
const compileSpecifier = "../../scripts/lib/compile.mjs";
const { AESTHETICS_ENTRIES, STYLES_ENTRIES } = (await import(entriesSpecifier)) as Record<string, Entry[]>;
const { TAILWIND_VERSION } = (await import(compileSpecifier)) as { TAILWIND_VERSION: string };

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
const tailwindVersion = JSON.parse(
  await readFile(fileURLToPath(import.meta.resolve("tailwindcss/package.json")), "utf8"),
).version as string;
const isCatalogRelease = tailwindVersion === TAILWIND_VERSION;

/* Every utility `/tw` defines, with the file that defines it, as `omit` reads it. */
const utilities: { name: string; file: string }[] = [];

const twFiles = (await readdir(path.join(packageRoot, "tw"), { recursive: true }))
  .map((relative) => relative.replaceAll("\\", "/"))
  .filter((file) => file.endsWith(".css"));
const twSources = await Promise.all(twFiles.map((file) => readFile(path.join(packageRoot, "tw", file), "utf8")));

for (const [index, file] of twFiles.entries()) {
  postcss.parse(twSources[index]!).walkAtRules("utility", (rule) => {
    utilities.push({ name: rule.params, file });
  });
}

const importOf = (specifier: string) => {
  const [file, ...layer] = specifier.split(" ");
  const url = file.startsWith("tailwindcss") ? file : pathToFileURL(path.join(packageRoot, "tw", file)).href;

  return `@import "${url}"${layer.length > 0 ? ` ${layer.join(" ")}` : ""};`;
};

const consumerBuild = async (imports: string[], candidates: string[]) => {
  const compiler = await compile(imports.map(importOf).join("\n"), {
    base: packageRoot,
    from: path.join(packageRoot, "consumer.css"),
    polyfills: POLYFILLS_NONE,
    onDependency() {},
  });

  return optimize(compiler.build(candidates), { minify: true }).code;
};

const REGISTRATION = /@property --tw-[\w-]+\{[^}]*\}/g;
const THEME_HOST = ":root,:host{";
const PACKAGE_HEAD = /^\/\*! @codenhub\/styles \| Apache-2\.0 \*\/\n/m;

/* The stylesheet without Tailwind's banner, the package's head, and the
   `--tw-*` registrations, and those registrations on their own. */
const separate = (css: string) => {
  let rules = css
    .replace(/^\/\*! tailwindcss v[^*]*\*\/\n/, "")
    .replace(PACKAGE_HEAD, "")
    .replace(REGISTRATION, "");

  /* Read as `:root`, Tailwind's theme rule sits beside the package's own
     `:root` rule, which the compiled build's minifier merged into it, so the
     two are merged the same way. Not by minifying again: Lightning CSS adds
     another `-webkit-` prefix on every pass. */
  if (rules.includes(THEME_HOST)) {
    const root = postcss.parse(rules.replaceAll(THEME_HOST, ":root{"));

    root.walkRules(":root", (rule) => {
      const previous = rule.prev();

      if (previous?.type === "rule" && previous.selector === ":root") {
        previous.append(rule.nodes);
        rule.remove();
      }
    });
    rules = root.toString();
  }

  if (!isCatalogRelease) {
    const root = postcss.parse(rules);

    root.each((node) => {
      if (node.type === "atrule" && node.name === "layer" && node.nodes && ["theme", "base"].includes(node.params)) {
        node.remove();
      }
    });
    /* Tailwind's `rounded-full` is `calc(infinity * 1px)`, which Lightning CSS
       writes as the largest number it keeps: 1.33, which the build and
       Tailwind 4.3.4 run, as `2147483647px`, and 1.32, which Tailwind 4.3.2
       and 4.3.3 run, as `3.40282e38px`. Both are a full round in every
       browser, so the older spelling is read as the newer. */
    rules = root.toString().replaceAll("3.40282e38px", "2147483647px");
  }

  return { rules, registrations: new Set(css.match(REGISTRATION)) };
};

/* The comparison leaves Tailwind's theme and Preflight out on any release but
   `TAILWIND_VERSION`, so a lockfile that moves the catalog's Tailwind would
   leave `src/base/` behind with nothing failing. The installed release is no
   witness, since the Tailwind workflow installs others on purpose; the
   lockfile's catalog is. Moving it means copying `src/base/` from the new
   release and raising `TAILWIND_VERSION` in the same change. */
test("src/base/ is copied from the catalog's Tailwind", async () => {
  const lockfile = await readFile(path.join(packageRoot, "../../pnpm-lock.yaml"), "utf8");
  const locked = lockfile.match(
    /^catalogs:\n {2}default:\n[\s\S]*?^ {4}tailwindcss:\n {6}specifier: [^\n]+\n {6}version: ([^\n]+)$/m,
  )?.[1];

  expect(locked).toBe(TAILWIND_VERSION);
});

describe(`/tw compiled by Tailwind ${tailwindVersion}`, () => {
  for (const { output, omit = () => false, tw } of [...STYLES_ENTRIES, ...AESTHETICS_ENTRIES]) {
    if (!tw) {
      continue;
    }

    test(`matches ${output}`, async () => {
      const candidates = utilities.filter((utility) => !omit(utility)).map(({ name }) => name);
      const compiled = separate(await readFile(path.join(packageRoot, output), "utf8"));
      const adapted = separate(await consumerBuild(tw, candidates));

      expect(adapted.rules).toBe(compiled.rules);
      expect([...compiled.registrations].filter((registration) => !adapted.registrations.has(registration))).toEqual(
        [],
      );
    });
  }
});

/* The package's `dark:`, `contrast-more:`, `contrast-less:`, `motion-safe:`,
   and `motion-reduce:` read an attribute, so they are selectors as well as
   media queries, and Tailwind writes a selector variant after the
   pseudo-element when it follows one: `before:motion-reduce:hidden` comes out
   as `.x::before:where(…)`, which no browser accepts, and Tailwind says
   nothing. Lightning CSS empties what it cannot keep, so the attribute arm is
   lost; the query arm comes out as `::placeholder:not(:where())`, which some
   engines accept (`tw-consumer.spec.ts` reads which). Tailwind's own `rtl:`
   and `aria-*:` fail the same way. Under Tailwind 4.3.4 no shape of the
   variant serves both orders: one that puts the condition first,
   `:where(…)&`, rescues `placeholder:` but not `before:` or `after:`, whose
   rule Tailwind nests under the one that sets `content`, and it
   breaks `not-contrast-less:`, `in-*`, and `has-*`, which substitute `*` for
   `&`. So docs/integrating/tailwind.md tells the consumer to write
   these variants first. The documented order is held to the attribute; the
   other is pinned too, so a Tailwind that learns to place it fails here and
   the docs can drop the rule. */
describe("the package's variants beside a pseudo-element variant", () => {
  const VARIANTS = ["dark", "contrast-more", "contrast-less", "motion-safe", "motion-reduce"];
  const PSEUDO_ELEMENTS = {
    before: [":before"],
    after: [":after"],
    placeholder: ["::placeholder"],
    file: ["::file-selector-button"],
    selection: ["::selection"],
    marker: ["::marker", "::-webkit-details-marker"],
    backdrop: ["::backdrop"],
  } as const;

  /* The selectors of the rules that hide the candidate, each split from its
     list. Each candidate is compiled on its own: Lightning CSS merges adjacent
     rules with the same declarations into one selector list, which would mix
     candidates. */
  const selectorsHiding = async (candidate: string) => {
    const compiler = await compile(
      ["tailwindcss/utilities.css layer(utilities)", "theme.css"].map(importOf).join("\n"),
      {
        base: packageRoot,
        from: path.join(packageRoot, "consumer.css"),
        polyfills: POLYFILLS_NONE,
        onDependency() {},
      },
    );
    const selectors: string[] = [];

    postcss.parse(optimize(compiler.build([candidate]), { minify: false }).code).walkDecls("display", (declaration) => {
      const rule = declaration.parent;

      if (declaration.value === "none" && rule?.type === "rule") {
        selectors.push(...(rule as postcss.Rule).selectors);
      }
    });

    return selectors;
  };

  /* A browser accepts a selector with a pseudo-element only when the
     pseudo-element ends it, but for some logical pseudo-classes: Lightning
     CSS empties the `:where()` it cannot keep there, and some engines accept
     `::placeholder:not(:where())`. So the reversed order is held to what
     every engine shares, that the attribute is not read before the
     pseudo-element, on the element. Every variant's selector names its
     attribute, `dark:` its classes too. */
  const usable = (selector: string, endings: readonly string[]) =>
    endings.some((ending) => selector.endsWith(ending)) && !/:(?:is|where)\(\)/.test(selector);
  const readsAttribute = (selector: string, endings: readonly string[]) => {
    const pseudoElement = Math.min(
      ...endings.map((ending) => selector.lastIndexOf(ending)).filter((index) => index !== -1),
    );

    return /\[data-(?:theme|contrast|motion)=/.test(selector.slice(0, pseudoElement));
  };

  for (const [pseudo, endings] of Object.entries(PSEUDO_ELEMENTS)) {
    for (const variant of VARIANTS) {
      test(`${variant}:${pseudo}: reads the attribute, and ${pseudo}:${variant}: does not`, async () => {
        const first = await selectorsHiding(`${variant}:${pseudo}:hidden`);
        const after = await selectorsHiding(`${pseudo}:${variant}:hidden`);

        expect(first.length).toBeGreaterThan(0);
        expect(first.filter((selector) => !usable(selector, endings))).toEqual([]);
        expect(first.some((selector) => readsAttribute(selector, endings))).toBe(true);
        expect(after.filter((selector) => readsAttribute(selector, endings))).toEqual([]);
      });
    }
  }
});
