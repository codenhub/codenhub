import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, test } from "vitest";

/* `@tailwindcss/node` 4.3.4 publishes declarations that import files it does
   not ship (`./ast`, `./compile`, and five more), so a typed import fails the
   typecheck with TS2307, and its `Polyfills` is an ambient const enum, which
   `isolatedModules` rejects. A specifier TypeScript does not resolve, typed with
   the two calls this file makes, keeps both out of the typecheck. */
type TailwindNode = {
  compile(
    css: string,
    options: { base: string; from: string; polyfills: number; onDependency(path: string): void },
  ): Promise<{ build(candidates: string[]): string }>;
  optimize(css: string, options: { minify: boolean }): { code: string };
};
const tailwindNodeSpecifier = "@tailwindcss/node";
const { compile, optimize } = (await import(tailwindNodeSpecifier)) as TailwindNode;
const POLYFILLS_ALL = 3; // `Polyfills.All` in `@tailwindcss/node`

/* What a consumer downloads is this package's first concern, so its size is
   held by ceilings rather than left to be noticed. Each ceiling is about 3% above
   what was measured when it was set, in minified bytes, which are fixed by their
   input; gzipped lengths are never compared, because zlib output can differ
   between machines for the same bytes
   (`docs/specs/packages-lifecycle.md`, "Bundle size"). A change that grows past a
   ceiling raises it in the same change, with the reason in its message.
   `docs/internal/tests.md` records the measurements. */

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
const tailwindCss = pathToFileURL(fileURLToPath(import.meta.resolve("tailwindcss/index.css"))).href;
const twEntry = (file: string) => pathToFileURL(path.join(packageRoot, "tw", file)).href;

// Minified bytes; each compiled file measured on 2026-11-11 with Tailwind 4.3.4.
const COMPILED_CEILINGS: Record<string, number> = {
  "dist/index.css": 204_000,
  "dist/components.css": 163_500,
  "dist/native.css": 304_000,
  "dist/theme.css": 12_200,
  "dist/palette.css": 26_800,
  "dist/aesthetics/index.css": 45_200,
  "dist/aesthetics/chunky-tile.css": 4_700,
  "dist/aesthetics/cyber.css": 4_500,
  "dist/aesthetics/glass.css": 11_400,
  "dist/aesthetics/neobrutalism.css": 4_350,
  "dist/aesthetics/pixel.css": 4_950,
  "dist/aesthetics/sketch.css": 15_350,
  /* Read by `chs build`, never served, but every consumer installs it. */
  "dist/purge/index.css": 282_000,
  "dist/purge/classes.json": 7_100,
};

describe("compiled stylesheets", () => {
  for (const [file, ceiling] of Object.entries(COMPILED_CEILINGS)) {
    test(`${file} stays under ${ceiling} bytes minified`, async () => {
      const css = await readFile(path.join(packageRoot, file), "utf8");

      expect(Buffer.byteLength(css)).toBeLessThanOrEqual(ceiling);
    });

    /* Every supported browser has `color-mix()` and `@property` (Chrome 123,
       Safari 17.5, Firefox 128), so Tailwind's fallbacks for older ones are bytes
       that never apply. `scripts/build-styles.mjs` turns them off. */
    test(`${file} carries no fallback for a browser below the supported ones`, async () => {
      const css = await readFile(path.join(packageRoot, file), "utf8");

      expect(css).not.toContain("color-mix(in lab, red, red)");
      expect(css).not.toContain("@layer properties");
    });
  }
});

/* A consumer's build compiled the way Tailwind's CLI and Vite plugin compile it,
   polyfills included, since neither lets a consumer turn them off. The candidates
   stand in for the class names Tailwind would find in the consumer's files. */
const consumerBuild = async (imports: string[], candidates: string[]) => {
  const input = imports.map((url) => `@import "${url}";`).join("\n");
  const compiler = await compile(input, {
    base: packageRoot,
    from: path.join(packageRoot, "consumer.css"),
    polyfills: POLYFILLS_ALL,
    onDependency() {},
  });

  return optimize(compiler.build(candidates), { minify: true }).code;
};

/* Measured as the package's cost over Tailwind alone on the same page, so a
   Tailwind release that changes Preflight or its own theme moves no ceiling. */
const packageCost = async (imports: string[], candidates: string[]) => {
  const [withPackage, tailwindAlone] = await Promise.all([
    consumerBuild(imports, candidates),
    consumerBuild([tailwindCss], candidates),
  ]);

  return Buffer.byteLength(withPackage) - Buffer.byteLength(tailwindAlone);
};

describe("a /tw consumer build", { timeout: 60_000 }, () => {
  const scenarios = [
    {
      name: "a page with one primary button, through /tw/button",
      imports: [tailwindCss, twEntry("components/button.css")],
      candidates: ["btn", "primary"],
      ceiling: 21_000,
    },
    {
      name: "a page that names no package class, through /tw/button",
      imports: [tailwindCss, twEntry("components/button.css")],
      candidates: [],
      ceiling: 9_200,
    },
    {
      name: "a page with one primary button, through /tw",
      imports: [twEntry("index.css")],
      candidates: ["btn", "primary"],
      ceiling: 25_000,
    },
  ];

  for (const { name, imports, candidates, ceiling } of scenarios) {
    test(`${name} costs at most ${ceiling} bytes over Tailwind alone`, async () => {
      const bytes = await packageCost(imports, candidates);

      expect(bytes).toBeLessThanOrEqual(ceiling);
    });
  }

  test("a page that names no package class gets no component rule", async () => {
    const css = await consumerBuild([tailwindCss, twEntry("components/button.css")], []);

    expect(css).not.toMatch(/(?:^|[{}])\.btn\{/);
  });
});
