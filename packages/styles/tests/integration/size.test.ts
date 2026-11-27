import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, test } from "vitest";

import { compile, optimize, POLYFILLS_ALL } from "./tailwind";

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

// Minified bytes, measured with Tailwind 4.3.4 on the dates `docs/internal/tests.md` records.
/* 0.11.0 set again, about 3% above the release's final measurement, the
   ceilings its growth had left with less than 2% to spare: the complete,
   native, components, aesthetics, glass, and pixel files, and the three
   consumer builds below. */
const COMPILED_CEILINGS: Record<string, number> = {
  /* The four below set again, with `/tw` and `/button/tw`'s button pages,
     after 0.11.0's reduced-motion reset reached scroll-driven animations and
     three more pseudo-elements, and a plate began handing its colour down
     beside its ink for the selection, one declaration in every component
     that composes `box`: 238,000, 191,400, 355,400, and 13,200 until then.
     The first three set again once the release's branches met: 247,100,
     195,900, and 367,000 until the read-only rest arrived and glass lifted
     a surface holding focus or an open popover. `/native` set again from
     375,500 when glass began grounding a control placed straight in its
     region, at 375,517. */
  "dist/index.css": 252_700,
  "dist/components.css": 201_400,
  "dist/native.css": 386_800,
  "dist/theme.css": 13_650,
  /* 26,800 until 0.11.0 wrote the dark values a second time, for the
     system's dark setting with no theme selector; 40,100 until it wrote the
     light values a second time, for print. */
  "dist/palette.css": 52_500,
  /* 50,450 until glass's lift and pixel's notch grew, as their own files did;
     51,500 until liquid's tokens followed the nearest region. */
  "dist/aesthetics/index.css": 52_900,
  /* 5,600 until 0.11.0 kept the solo class's tracking off scripts that join
     their letters or hang them from a headstroke: it ships without the
     components, so it carries the language list itself, regional languages
     and script subtags included; 6,200 until fourteen Arabic-script
     languages and Rohingya joined the list. */
  "dist/aesthetics/chunky-tile.css": 6_350,
  "dist/aesthetics/cyber.css": 4_900,
  /* 14,700 until 0.11.0 gave liquid's tokens only where glass is the
     nearest region, a second selector for each of six rules. */
  "dist/aesthetics/glass.css": 16_200,
  "dist/aesthetics/neobrutalism.css": 4_750,
  /* 5,100 until 0.11.0 drew the step as a `corner-shape: notch` where an
     engine draws one, beside the polygon, on components and solo actions. */
  "dist/aesthetics/pixel.css": 5_620,
  "dist/aesthetics/sketch.css": 15_350,
  /* Read by `chs build`, never served, but every consumer installs it. */
  /* 314,500 until 0.11.0 kept tracking off scripts that join their letters,
     a fallback in each of the eleven rules that copy a text style, and
     raised a glass surface holding a tooltip, scoped the bubble to it, gave
     a glass pane an opaque ground on a plate, and let a button label wrap;
     327,000 until the reset and the selection grew as the complete file's
     did; 339,200 until the release's branches met, as the complete
     file's did. */
  "dist/purge/index.css": 344_800,
  "dist/purge/classes.json": 7_100,
  /* Read by the generator, never served (docs/internal/generator.md). */
  "dist/utilities.json": 72_000,
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
      name: "a page with one primary button, through /button/tw",
      imports: [tailwindCss, twEntry("components/button.css")],
      candidates: ["btn", "primary"],
      /* 21,800 until 0.11.0 capped a held neutral box's fill, 18 bytes more;
         22,600 since its held boxes and toggles drew a surface's ink;
         22,950 until the reduced-motion reset and the selection grew. */
      ceiling: 23_500,
    },
    {
      name: "a page that names no package class, through /button/tw",
      imports: [tailwindCss, twEntry("components/button.css")],
      candidates: [],
      // 10,150 until the reduced-motion reset grew.
      ceiling: 10_350,
    },
    {
      name: "a page with one primary button, through /tw",
      imports: [twEntry("index.css")],
      candidates: ["btn", "primary"],
      /* 27,550 until 0.11.0's reset reached a dialog's backdrop and a view
         transition, rules every page with the reset carries, and the button
         learned to wrap its label and a pane its ground on a plate, and the
         view transition reset and the no-tracking language list grew;
         31,400 until the reset reached scroll-driven animations and three
         more pseudo-elements and the selection read the plate;
         35,700 until the release's branches met, as the complete file's
         ceiling was set again. */
      ceiling: 36_400,
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
