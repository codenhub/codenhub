/**
 * Bakes `@codenhub/styles`' real, composed colors into this package's own
 * generated defaults -- `src/styles/generated-defaults.css` -- so the toast
 * and its dialog buttons look right out of the box, without ever computing a
 * fill/edge/ground formula themselves.
 *
 * Two sources, both real:
 * - `packages/styles/src/palette.css`, styles' own generated output, is
 *   plain text: the composed `--palette-<intent>-<presentation>[-<ground>]-<slot>`
 *   declarations this script needs are read directly off it, light and dark.
 * - `--color-border`/`--color-surface`/`--color-text` are not part of the
 *   published palette (they are not intent x presentation cells), so they are
 *   read the same way `@codenhub/styles`' own palette generator reads
 *   anything: compiled through the real Tailwind CLI from the real
 *   `src/theme.css`, then read back from a real browser via Playwright.
 *
 * Run as this package's own `generate` script, the way `hub generate` runs
 * any package that owns one. `--dry-run` reports drift without writing.
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { applyGenerated, findWorkspaceRoot } from "@codenhub/tools/generators";
import { chromium } from "@playwright/test";

const executeFile = promisify(execFile);
const packageRoot = fileURLToPath(new URL("..", import.meta.url));

/** Toast-body cells: soft, page ground -- `.alert`'s own unstyled default. */
const TOAST_INTENTS = ["neutral", "success", "destructive", "warning", "info"];

/** Dialog-button cells: solid, ground-independent -- `.btn`'s own unstyled default. */
const BUTTON_INTENTS = ["primary", "secondary", "success", "destructive"];

/**
 * Splits `palette.css` into its light (`:root`) and dark
 * (`.dark, .theme-dark, [data-theme="dark"]`) declaration blocks.
 * @param paletteText Contents of `packages/styles/src/palette.css`.
 * @returns The two blocks' raw text, each still holding its declarations.
 */
function splitPaletteThemes(paletteText) {
  const darkStart = paletteText.indexOf(".dark,");
  if (darkStart === -1) {
    throw new Error("palette.css has no `.dark,` block -- has its dark-mode selector changed?");
  }
  return { dark: paletteText.slice(darkStart), light: paletteText.slice(0, darkStart) };
}

/**
 * Reads one `--palette-*` declaration's value out of a block of CSS text.
 * @param block Light or dark declaration block from {@link splitPaletteThemes}.
 * @param name Declaration name without its `--palette-` prefix.
 * @returns The declaration's value.
 */
function readPaletteValue(block, name) {
  const match = block.match(new RegExp(`--palette-${name}:\\s*([^;]+);`));
  if (!match) {
    throw new Error(`palette.css has no --palette-${name} declaration -- has the palette's naming changed?`);
  }
  return match[1].trim();
}

/**
 * Compiles a throwaway stylesheet from `@codenhub/styles`' real `src/theme.css`
 * through the real Tailwind CLI, the same way that package's own palette
 * generator compiles its harness -- see
 * `packages/styles/scripts/generate-palette.mjs`'s `compileHarnessStylesheet`
 * for why Windows needs `cmd.exe` in the loop.
 * @param stylesRoot Absolute path to `packages/styles`.
 * @param temporaryRoot Directory to write the throwaway entry and output into.
 * @returns Path to the compiled CSS file.
 */
async function compileThemeHarness(stylesRoot, temporaryRoot) {
  const inputPath = path.join(temporaryRoot, "input.css");
  const outputPath = path.join(temporaryRoot, "output.css");
  const themePath = path.join(stylesRoot, "src", "theme.css").replaceAll("\\", "/");

  await writeFile(inputPath, `@import "${themePath}";\n`);

  const binName = process.platform === "win32" ? "tailwindcss.CMD" : "tailwindcss";
  const binPath = path.join(stylesRoot, "node_modules", ".bin", binName);
  const relativeInput = path.relative(stylesRoot, inputPath);
  const relativeOutput = path.relative(stylesRoot, outputPath);

  if (process.platform === "win32") {
    const commandLine = `"${binPath}" -i ${relativeInput} -o ${relativeOutput}`;
    await executeFile(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", commandLine], {
      cwd: stylesRoot,
      windowsVerbatimArguments: true,
    });
  } else {
    await executeFile(binPath, ["-i", relativeInput, "-o", relativeOutput], { cwd: stylesRoot });
  }

  return outputPath;
}

/**
 * Reads `--color-border`/`--color-surface`/`--color-text` as real, computed
 * 8-bit sRGB, light and dark, from a real browser rendering the compiled
 * harness.
 * @param stylesheetPath Compiled harness CSS, written to disk.
 * @param temporaryRoot Directory to write the throwaway probe page into.
 * @returns Light and dark hex values for each of the three tokens.
 */
async function readNeutralTokens(stylesheetPath, temporaryRoot) {
  const tokens = ["border", "surface", "text"];
  const stylesheetHref = pathToFileURL(stylesheetPath).href;
  const style = tokens.map((token) => `.${token} { background: var(--color-${token}); }`).join("\n");
  const body = tokens.map((token) => `<div class="${token}" id="${token}"></div>`).join("\n");

  const browser = await chromium.launch();

  try {
    const readTheme = async (theme) => {
      const htmlPath = path.join(temporaryRoot, `neutral-${theme}.html`);
      await writeFile(
        htmlPath,
        `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8" /><link rel="stylesheet" href="${stylesheetHref}" /><style>${style}</style></head><body>${body}</body></html>`,
      );
      const page = await browser.newPage();
      try {
        await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
        return await page.evaluate((ids) => {
          // Normalizes a computed color to 8-bit sRGB hex -- the resolved
          // `oklch()`/`color(srgb ...)` values these plain (non-color-mix)
          // tokens serialize as need the same oklab round-trip
          // `tests/browser/test-utils.ts` uses, not a bare rgb() parse.
          const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
          const toGamma = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
          const clamp = (c) => Math.min(1, Math.max(0, c));
          const components = (body) =>
            body
              .split(/[,\s/]+/)
              .filter(Boolean)
              .map((c) => (c === "none" ? 0 : Number.parseFloat(c)));
          const oklabToLinear = ({ a, b, lightness }) => {
            const long = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
            const medium = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
            const short = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
            return {
              blue: clamp(-0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short),
              green: clamp(-1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short),
              red: clamp(4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short),
            };
          };
          const toHex = (color) => {
            const oklch = color.match(/oklch\(([^)]+)\)/);
            let linear;
            if (oklch) {
              const [lightness = 0, chroma = 0, hue = 0] = components(oklch[1]);
              const hueRadians = (hue * Math.PI) / 180;
              linear = oklabToLinear({ a: chroma * Math.cos(hueRadians), b: chroma * Math.sin(hueRadians), lightness });
            } else {
              const rgb = color.match(/rgba?\(([^)]+)\)/);
              const [r = 0, g = 0, b = 0] = components(rgb[1]);
              linear = { blue: toLinear(b / 255), green: toLinear(g / 255), red: toLinear(r / 255) };
            }
            const channel = (c) =>
              Math.round(toGamma(c) * 255)
                .toString(16)
                .padStart(2, "0");
            return `#${channel(linear.red)}${channel(linear.green)}${channel(linear.blue)}`;
          };
          const out = {};
          for (const id of ids) {
            out[id] = toHex(getComputedStyle(document.getElementById(id)).backgroundColor);
          }
          return out;
        }, tokens);
      } finally {
        await page.close();
      }
    };

    // Sequential on purpose: two pages against one shared browser process
    // racing file:// navigation intermittently closed the target mid-read.
    const light = await readTheme("light");
    const dark = await readTheme("dark");
    return { dark, light };
  } finally {
    await browser.close();
  }
}

/**
 * Builds the generated CSS: toaster's own `--toast-default-*` custom
 * properties, light and dark, one per cell this package's CSS reads.
 * @param light Light-theme values, palette cells and neutral tokens.
 * @param dark Dark-theme values, palette cells and neutral tokens.
 * @returns The full `generated-defaults.css` file contents.
 */
function renderCss(light, dark) {
  const lines = (values) =>
    Object.entries(values)
      .map(([name, value]) => `  --toast-default-${name}: ${value};`)
      .join("\n");

  return [
    "/* Generated by `pnpm generate` from `@codenhub/styles`, through",
    "   `scripts/generate-toast-defaults.mjs`. Do not hand-edit -- these are",
    "   this package's own baked-in defaults, read from the real",
    "   `@codenhub/styles` composition so the toast and its dialog buttons",
    "   look right with no styles-package dependency at all. */",
    "",
    ":root {",
    lines(light),
    "}",
    "",
    ".dark,",
    ".theme-dark,",
    '[data-theme="dark"] {',
    lines(dark),
    "}",
    "",
  ].join("\n");
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  const workspaceRoot = await findWorkspaceRoot(packageRoot);
  const stylesRoot = path.join(workspaceRoot, "packages", "styles");
  const temporaryRoot = path.join(packageRoot, ".toast-defaults-tmp");

  await rm(temporaryRoot, { force: true, recursive: true });
  await mkdir(temporaryRoot, { recursive: true });

  let light;
  let dark;

  try {
    const paletteText = await readFile(path.join(stylesRoot, "src", "palette.css"), "utf8");
    const { dark: darkBlock, light: lightBlock } = splitPaletteThemes(paletteText);

    const paletteValues = (block) => {
      const values = {};
      for (const intent of TOAST_INTENTS) {
        values[`${intent}-bg`] = readPaletteValue(block, `${intent}-soft-page-bg`);
        values[`${intent}-fg`] = readPaletteValue(block, `${intent}-soft-fg`);
        values[`${intent}-edge`] = readPaletteValue(block, `${intent}-soft-page-edge`);
      }
      for (const intent of BUTTON_INTENTS) {
        values[`btn-${intent}-bg`] = readPaletteValue(block, `${intent}-solid-bg`);
        values[`btn-${intent}-fg`] = readPaletteValue(block, `${intent}-solid-fg`);
        values[`btn-${intent}-bg-hover`] = readPaletteValue(block, `${intent}-solid-bg-hover`);
      }
      return values;
    };

    console.error("Reading composed cells from the real palette.css...");
    const lightPalette = paletteValues(lightBlock);
    const darkPalette = paletteValues(darkBlock);

    console.error("Compiling the real theme through the real Tailwind CLI...");
    const stylesheetPath = await compileThemeHarness(stylesRoot, temporaryRoot);

    console.error("Launching a browser to read the real neutral tokens...");
    const neutral = await readNeutralTokens(stylesheetPath, temporaryRoot);

    light = { ...lightPalette, border: neutral.light.border, surface: neutral.light.surface, text: neutral.light.text };
    dark = { ...darkPalette, border: neutral.dark.border, surface: neutral.dark.surface, text: neutral.dark.text };
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }

  const output = renderCss(light, dark);
  const [outcome] = await applyGenerated([{ contents: output, path: "src/styles/generated-defaults.css" }], {
    dryRun: isDryRun,
    root: packageRoot,
  });

  if (isDryRun) {
    console.log(
      outcome.hasDrift
        ? "src/styles/generated-defaults.css is out of date."
        : "src/styles/generated-defaults.css is up to date.",
    );
    if (outcome.hasDrift) {
      process.exitCode = 1;
    }
    return;
  }

  console.log(
    outcome.hasDrift
      ? "src/styles/generated-defaults.css written."
      : "src/styles/generated-defaults.css is already up to date.",
  );
}

await main();
