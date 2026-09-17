/**
 * Computes `src/palette.css`: every `intent x presentation` cell's `bg`, `fg`,
 * and `edge`, rest and hover, light and dark, baked to a flat custom property.
 *
 * This does not reimplement `box.css`'s formula -- that would be exactly the
 * hand-retyping this file exists to prevent (see
 * `docs/internal/generated-palette.md`). Instead it compiles the package's own
 * real `src/index.css` through the real Tailwind CLI, then renders real
 * `.box`-composed probe elements in a real browser and reads their computed
 * styles -- the same `getComputedStyle()` contract `tests/browser/test-
 * utils.ts` already uses for verification. The published value is therefore
 * the browser's own answer, not a re-derivation of it.
 *
 * Invoked by `packages/tools`' `styles-palette` generator (`pnpm generate`),
 * which captures this script's stdout as `src/palette.css`'s contents. Prints
 * only the generated CSS to stdout; progress goes to stderr.
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { chromium } from "@playwright/test";

const executeFile = promisify(execFile);
const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFile(path.join(packageRoot, file), "utf8");

const registry = JSON.parse(await read("registry.json"));
const INTENTS = Object.keys(registry.intents);
/* The closed ground set `docs/internal/generated-palette.md` names, read from
   the same registry component defaults it cites: `.badge`/`.btn`'s
   `transparent` (`box`'s own default, no override needed), `.alert`'s
   `--color-background` (suffix `page`), and `.pre`/`.code`/`.kbd`'s
   `--intent-subtle` (suffix `subtle`). `.solid` is ground-independent and
   skips this entirely -- see the doc's "What gets baked" section. */
const GROUNDS = [
  { suffix: "", token: undefined },
  { suffix: "page", token: "var(--color-background)" },
  { suffix: "subtle", token: "var(--intent-subtle)" },
];
/* Matches `theme.css`'s explicit-override arm exactly (`.dark`, `.theme-dark`,
   `[data-theme="dark"]`), not the `prefers-color-scheme` arm -- the doc's
   "Dark mode" section is explicit that no OS-preference fallback is generated. */
const THEMES = ["light", "dark"];

/**
 * Compiles the package's own real `src/index.css` through the real Tailwind
 * CLI into one throwaway stylesheet, invoked the same way `build:styles`
 * invokes it for every other `dist/*.css` output. Windows needs `cmd.exe` in
 * the loop for a `.CMD` shim; `execFile`'s own `shell: true` mis-escapes the
 * shim path, so `cmd.exe /d /s /c` is built by hand instead.
 * @param temporaryRoot Directory to write the throwaway entry and output into.
 * @returns Path to the compiled CSS file.
 */
async function compileHarnessStylesheet(temporaryRoot) {
  const inputPath = path.join(temporaryRoot, "input.css");
  const outputPath = path.join(temporaryRoot, "output.css");
  const indexPath = path.join(packageRoot, "src", "index.css").replaceAll("\\", "/");

  await writeFile(inputPath, `@import "${indexPath}";\n`);

  const binName = process.platform === "win32" ? "tailwindcss.CMD" : "tailwindcss";
  const binPath = path.join(packageRoot, "node_modules", ".bin", binName);
  const relativeInput = path.relative(packageRoot, inputPath);
  const relativeOutput = path.relative(packageRoot, outputPath);

  if (process.platform === "win32") {
    // `cmd.exe /d /s /c` in the loop because a `.CMD` shim needs a shell on
    // Windows, and `execFile`'s own `shell: true` mis-escapes the shim path.
    // Project-relative paths, matching `build:styles`'s own invocation:
    // an absolute path here reproducibly fails with "The filename, directory
    // name, or volume label syntax is incorrect."
    const commandLine = `"${binPath}" -i ${relativeInput} -o ${relativeOutput}`;
    await executeFile(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", commandLine], {
      cwd: packageRoot,
      windowsVerbatimArguments: true,
    });
  } else {
    await executeFile(binPath, ["-i", relativeInput, "-o", relativeOutput], { cwd: packageRoot });
  }

  return outputPath;
}

/**
 * Builds one probe descriptor per cell this run needs.
 * @returns Probe descriptors, each carrying the `data-key` the read pass and
 *   the hover pass both address it by.
 */
function buildProbes() {
  const probes = [];

  for (const intent of INTENTS) {
    probes.push({ classes: `box box-hover ${intent} solid edged`, key: `${intent}-solid`, readsBg: true });
    for (const presentation of ["soft", "ghost"]) {
      probes.push({
        classes: `box box-hover ${intent} ${presentation} edged`,
        key: `${intent}-${presentation}-fg`,
        readsBg: false,
      });
      for (const ground of GROUNDS) {
        const key = ground.suffix === "" ? `${intent}-${presentation}` : `${intent}-${presentation}-${ground.suffix}`;

        probes.push({
          classes: `box box-hover ${intent} ${presentation} edged`,
          key,
          readsBg: true,
          style: ground.token === undefined ? undefined : `--_d-ground: ${ground.token}`,
        });
      }
    }
  }

  return probes;
}

/**
 * Renders every probe for one theme and reads its computed styles, rest and
 * hover. Hover is a real `:hover`, driven through Playwright rather than
 * forced through a browser-specific devtools hook, so it composes the same
 * way `box-hover`'s own `&:hover` rule expects.
 * @param browser Playwright browser instance.
 * @param stylesheetPath Compiled harness CSS, written to disk.
 * @param theme Theme name from {@link THEMES}.
 * @returns Map from `data-key` to its rest and hover computed styles.
 */
async function readTheme(browser, stylesheetPath, theme, temporaryRoot) {
  const probes = buildProbes();
  const htmlPath = path.join(temporaryRoot, `probes-${theme}.html`);
  const stylesheetHref = path.relative(temporaryRoot, stylesheetPath).replaceAll("\\", "/");
  const body = probes
    .map(
      ({ classes, key, style }) =>
        `<div class="${classes}" data-key="${key}"${style === undefined ? "" : ` style="${style}"`}>probe</div>`,
    )
    .join("\n");

  await writeFile(
    htmlPath,
    `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8" /><link rel="stylesheet" href="${stylesheetHref}" /></head><body>${body}</body></html>`,
  );

  const page = await browser.newPage();

  try {
    /* `box` transitions `background-color`/`border-color` on hover
       (`--motion-duration-normal`, 200ms), and `reset.css` -- part of the real
       `src/index.css` this harness compiles -- collapses every transition to
       0.01ms under reduced motion. Without this a hover read races the
       transition and lands on a random interpolated frame instead of the
       resting hover value, which is exactly what made two runs of this script
       disagree before this was added. */
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });

    const rest = await page.evaluate(() => {
      const values = {};
      for (const element of document.querySelectorAll("[data-key]")) {
        const styles = getComputedStyle(element);
        values[element.dataset.key] = {
          bg: styles.backgroundColor,
          edge: styles.borderTopColor,
          fg: styles.color,
        };
      }
      return values;
    });

    /* oxlint-disable no-await-in-loop -- one page, hovered in turn: hover is a
       real `:hover`, and each read has to settle before the next probe moves
       the mouse away from the one it just read. */
    for (const { key } of probes.filter((probe) => probe.readsBg)) {
      await page.locator(`[data-key="${key}"]`).hover();
      /* `:hover` matches immediately, but the `background-color: var(--_bg)`
         declaration on `.box` does not visibly repaint to `--_bg`'s new,
         `.box-hover`-won value until the browser's next style flush, and that
         flush can take more than one animation frame. A fixed wait raced it
         and baked the still-resting value into the generated palette; two
         consecutive equal samples can race it too, since two frames can both
         land before the repaint and agree on the stale resting value.
         Waiting for the read to actually move off the already-known resting
         value first, then for it to stop moving, is what actually settles on
         the real one regardless of how long the engine takes to repaint. */
      const hovered = await page.evaluate(
        ({ probeKey, restingBg, restingEdge }) => {
          const element = document.querySelector(`[data-key="${probeKey}"]`);
          const read = () => {
            const styles = getComputedStyle(element);
            return { bg: styles.backgroundColor, edge: styles.borderTopColor };
          };
          const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

          return (async () => {
            let current = read();

            for (let frame = 0; frame < 60 && current.bg === restingBg && current.edge === restingEdge; frame += 1) {
              await nextFrame();
              current = read();
            }

            let previous = current;

            for (let frame = 0; frame < 60; frame += 1) {
              await nextFrame();
              current = read();

              if (current.bg === previous.bg && current.edge === previous.edge) {
                return current;
              }
              previous = current;
            }

            return previous;
          })();
        },
        { probeKey: key, restingBg: rest[key].bg, restingEdge: rest[key].edge },
      );

      rest[key].bgHover = hovered.bg;
      rest[key].edgeHover = hovered.edge;
    }

    return rest;
  } finally {
    await page.close();
  }
}

/**
 * Turns one theme's read-out into `--palette-*` declarations.
 * @param values Map from `data-key` to computed styles, from {@link readTheme}.
 * @returns Declarations in `--name: value;` form, one per line.
 */
function toDeclarations(values) {
  const lines = [];

  for (const intent of INTENTS) {
    const solid = values[`${intent}-solid`];

    lines.push(`--palette-${intent}-solid-bg: ${solid.bg};`);
    lines.push(`--palette-${intent}-solid-fg: ${solid.fg};`);
    lines.push(`--palette-${intent}-solid-edge: ${solid.edge};`);
    lines.push(`--palette-${intent}-solid-bg-hover: ${solid.bgHover};`);
    lines.push(`--palette-${intent}-solid-edge-hover: ${solid.edgeHover};`);

    for (const presentation of ["soft", "ghost"]) {
      lines.push(`--palette-${intent}-${presentation}-fg: ${values[`${intent}-${presentation}-fg`].fg};`);

      for (const ground of GROUNDS) {
        const name = ground.suffix === "" ? `${intent}-${presentation}` : `${intent}-${presentation}-${ground.suffix}`;
        const cell = values[name];

        lines.push(`--palette-${name}-bg: ${cell.bg};`);
        lines.push(`--palette-${name}-edge: ${cell.edge};`);
        lines.push(`--palette-${name}-bg-hover: ${cell.bgHover};`);
        lines.push(`--palette-${name}-edge-hover: ${cell.edgeHover};`);
      }
    }
  }

  return lines.map((line) => `  ${line}`).join("\n");
}

async function main() {
  /* Inside the package rather than the OS temp directory: the Tailwind CLI's
     `.CMD` shim on Windows needs `cmd.exe` in the loop (see
     {@link compileHarnessStylesheet}), and quoting a short (8.3) OS temp path
     through it was unreliable in a way a plain project-relative path is not. */
  const temporaryRoot = path.join(packageRoot, ".palette-tmp");

  await rm(temporaryRoot, { force: true, recursive: true });
  await mkdir(temporaryRoot, { recursive: true });

  try {
    console.error("Compiling the real stylesheet through the real Tailwind CLI...");
    const stylesheetPath = await compileHarnessStylesheet(temporaryRoot);

    console.error("Launching a browser to read the real composed values...");
    const browser = await chromium.launch();

    try {
      const results = [];

      /* oxlint-disable no-await-in-loop -- sequential on purpose: two pages
         polling animation frames for a settled hover read at the same time,
         against one shared browser process, starved each other's rAF timing
         under contention and settled on a stale frame. Not latency-sensitive
         enough to be worth that risk for the concurrency `Promise.all` bought. */
      for (const theme of THEMES) {
        results.push(await readTheme(browser, stylesheetPath, theme, temporaryRoot));
      }

      const [light, dark] = results;

      const output = [
        "/* Generated by `pnpm generate` from `src/index.css`, through",
        "   `scripts/generate-palette.mjs`. Do not hand-edit -- see",
        "   `docs/internal/generated-palette.md` for what this is and why it exists. */",
        "",
        ":root {",
        toDeclarations(light),
        "}",
        "",
        ".dark,",
        ".theme-dark,",
        '[data-theme="dark"] {',
        toDeclarations(dark),
        "}",
        "",
      ].join("\n");

      process.stdout.write(output);
    } finally {
      await browser.close();
    }
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

await main();
