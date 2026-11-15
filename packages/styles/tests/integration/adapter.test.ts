import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import postcss from "postcss";
import { describe, expect, test } from "vitest";

/* `dist/` is compiled by the package's own build and `/tw` by the consumer's
   Tailwind, from the same `src/`. They must agree: a class a `/tw` consumer
   compiles is the class the compiled stylesheet ships, rule for rule and in the
   same order, which the overrides in docs/internal/model.md#cascade-layers are
   tuned to. So each compiled entry is compiled again from its `/tw`
   counterpart, naming every utility it ships, and the two compared.

   Two differences are by design. Tailwind heads every build with its banner,
   and the compiled build only an entry that carries some of Tailwind's own
   CSS. And `/tw` ships all nine `--tw-*` registrations the package's bodies
   need, where the compiled build writes those its output uses: both are
   compared as sets, the compiled one inside the other.

   On the catalog's Tailwind, the one `src/base/` is copied from, the rest is
   byte for byte. On another release, as the Tailwind workflow runs, Tailwind's
   own theme values and Preflight are that release's, so `theme` and `base` are
   left out and the package's components and utilities compared alone. */

// As in `size.test.ts`: `@tailwindcss/node` publishes declarations TypeScript cannot resolve.
type TailwindNode = {
  compile(
    css: string,
    options: { base: string; from: string; polyfills: number; onDependency(path: string): void },
  ): Promise<{ build(candidates: string[]): string }>;
  optimize(css: string, options: { minify: boolean }): { code: string };
};
type Entry = {
  output: string;
  omit?: (utility: { name: string; file: string }) => boolean;
  tw: string[] | null;
};
const tailwindNodeSpecifier = "@tailwindcss/node";
const { compile, optimize } = (await import(tailwindNodeSpecifier)) as TailwindNode;
const POLYFILLS_NONE = 0; // `Polyfills.None` in `@tailwindcss/node`

// The build's own modules, untyped JavaScript.
const entriesSpecifier = "../../scripts/lib/entries.mjs";
const compileSpecifier = "../../scripts/lib/compile.mjs";
const noticeSpecifier = "../../scripts/notice.mjs";
const { AESTHETICS_ENTRIES, STYLES_ENTRIES } = (await import(entriesSpecifier)) as Record<string, Entry[]>;
const { TAILWIND_VERSION } = (await import(compileSpecifier)) as { TAILWIND_VERSION: string };
const { withNotice } = (await import(noticeSpecifier)) as { withNotice(css: string): string };

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

  return withNotice(optimize(compiler.build(candidates), { minify: true }).code);
};

const REGISTRATION = /@property --tw-[\w-]+\{[^}]*\}/g;

/* The stylesheet without Tailwind's banner and the `--tw-*` registrations,
   and those registrations on their own. */
const separate = (css: string) => {
  let rules = css.replace(/^\/\*! tailwindcss v[^*]*\*\/\n/, "").replace(REGISTRATION, "");

  if (!isCatalogRelease) {
    const root = postcss.parse(rules);

    root.each((node) => {
      if (node.type === "atrule" && node.name === "layer" && node.nodes && ["theme", "base"].includes(node.params)) {
        node.remove();
      }
    });
    rules = root.toString();
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
