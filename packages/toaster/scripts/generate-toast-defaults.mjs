/**
 * Bakes `@codenhub/styles`' real, composed colors into this package's own
 * generated defaults -- `src/styles/generated-defaults.css` -- so the toast
 * and its dialog buttons look right out of the box, without ever computing a
 * fill/edge/ground formula themselves.
 *
 * `packages/styles/src/palette.css`, styles' own generated output, is plain
 * text: every declaration this script needs -- the composed
 * `--palette-<intent>-<presentation>[-<ground>]-<slot>` cells and the flat
 * `--palette-border`/`--palette-surface`/`--palette-text` neutral tokens --
 * is read directly off it, light and dark. Nothing here compiles Tailwind or
 * launches a browser; `@codenhub/styles`' own generator already did that
 * work once, and this script only reads its output as text.
 *
 * Run as this package's own `generate` script, the way `hub generate` runs
 * any package that owns one. `--dry-run` reports drift without writing.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applyGenerated, findWorkspaceRoot } from "@codenhub/tools/generators";

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
 * Reads one theme block's full set of values this package needs: every
 * `TOAST_INTENTS`/`BUTTON_INTENTS` cell plus the flat neutral tokens.
 * @param block Light or dark declaration block from {@link splitPaletteThemes}.
 * @returns Flat `{ name: value }` map, keyed the same way `renderCss` expects.
 */
function readThemeValues(block) {
  const values = {};
  for (const intent of TOAST_INTENTS) {
    // Default look: .soft, page ground -- .alert's own unstyled default.
    values[`${intent}-bg`] = readPaletteValue(block, `${intent}-soft-page-bg`);
    values[`${intent}-fg`] = readPaletteValue(block, `${intent}-soft-fg`);
    values[`${intent}-edge`] = readPaletteValue(block, `${intent}-soft-page-edge`);
    // .solid, ground-independent -- read so a .solid toast (cascaded from
    // an ancestor the same way every other @codenhub/styles presentation
    // class cascades) has something real to switch to.
    values[`${intent}-solid-bg`] = readPaletteValue(block, `${intent}-solid-bg`);
    values[`${intent}-solid-fg`] = readPaletteValue(block, `${intent}-solid-fg`);
    values[`${intent}-solid-edge`] = readPaletteValue(block, `${intent}-solid-edge`);
  }
  for (const intent of BUTTON_INTENTS) {
    // Default look: .solid, ground-independent -- .btn's own unstyled default.
    values[`btn-${intent}-bg`] = readPaletteValue(block, `${intent}-solid-bg`);
    values[`btn-${intent}-fg`] = readPaletteValue(block, `${intent}-solid-fg`);
    values[`btn-${intent}-bg-hover`] = readPaletteValue(block, `${intent}-solid-bg-hover`);
    // .edged on the default .solid button.
    values[`btn-${intent}-solid-edge`] = readPaletteValue(block, `${intent}-solid-edge`);
    values[`btn-${intent}-solid-edge-hover`] = readPaletteValue(block, `${intent}-solid-edge-hover`);
    // .soft and .ghost, transparent ground (.btn's own ground) -- read so
    // those presentation classes have something real to switch to too.
    for (const presentation of ["soft", "ghost"]) {
      for (const slot of ["bg", "fg", "edge", "bg-hover", "edge-hover"]) {
        values[`btn-${intent}-${presentation}-${slot}`] = readPaletteValue(block, `${intent}-${presentation}-${slot}`);
      }
    }
  }
  values.border = readPaletteValue(block, "border");
  values.surface = readPaletteValue(block, "surface");
  values.text = readPaletteValue(block, "text");
  return values;
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

  const paletteText = await readFile(path.join(stylesRoot, "src", "palette.css"), "utf8");
  const { dark: darkBlock, light: lightBlock } = splitPaletteThemes(paletteText);

  console.error("Reading composed cells from the real palette.css...");
  const light = readThemeValues(lightBlock);
  const dark = readThemeValues(darkBlock);

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
