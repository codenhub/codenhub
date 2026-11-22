/**
 * Bakes `@codenhub/styles`' real, uncomposed color inputs into this package's
 * own generated defaults -- `src/styles/generated-defaults.css` -- so a toast
 * or dialog rendered with no `@codenhub/styles` on the page still has a real
 * accent color, contrast tone, and strong tone to compose against.
 *
 * Earlier versions of this generator baked fully pre-composed cells (one per
 * severity per presentation). That is no longer this package's model: color
 * composition now happens live, at render time, in `src/styles/index.css`,
 * against whichever inputs are in scope -- `@codenhub/styles`' live
 * `--color-*` tokens when it is loaded, or these baked `--toast-default-*`
 * inputs when it is not. Baking the raw inputs rather than the composed
 * result is what lets the same formula produce both.
 *
 * `packages/styles/src/palette.css`, styles' own generated output, is plain
 * text: every raw input this package needs can be read off it without
 * resolving Tailwind's own color scale, because a "solid" cell (100% fill,
 * 100% on-fill) IS the uncomposed accent and contrast color for any intent
 * whose fill is uncapped (`--intent-fill-max: 100%` -- every named severity
 * and button role), and a "soft" cell's foreground IS the uncomposed
 * "strong" tone (0% on-fill at any fill at or under 50%, styles.css `box`'s
 * own formula). Nothing here compiles Tailwind or launches a browser;
 * `@codenhub/styles`' own generator already did that work once, and this
 * script only reads its output as text.
 *
 * Run as this package's own `generate` script, the way `hub generate` runs
 * any package that owns one. `--dry-run` reports drift without writing.
 */
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applyGenerated, findWorkspaceRoot } from "@codenhub/tools/generators";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

/** Toast-severity intents. `neutral` backs the unclassed "default" toast. */
const NAMED_SEVERITIES = ["success", "destructive", "warning", "info"];

/** Dialog-button intents. Share the same accent as the matching severity. */
const BUTTON_ROLES = ["primary", "secondary", "success", "destructive"];

/**
 * Splits one `light-dark(light, dark)` value into its two arguments, at the
 * comma that sits outside every nested parenthesis. A value that is not a
 * `light-dark()` pair is the same in both themes.
 * @param value A `--palette-*` declaration's value.
 * @returns The light and dark values.
 */
function splitLightDark(value) {
  const match = value.match(/^light-dark\(([\s\S]*)\)$/);
  if (!match) {
    return { dark: value, light: value };
  }
  const inner = match[1];
  let depth = 0;
  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index];
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    } else if (char === "," && depth === 0) {
      return { dark: inner.slice(index + 1).trim(), light: inner.slice(0, index).trim() };
    }
  }
  throw new Error(`palette.css has a light-dark() value with one argument: ${value}`);
}

/**
 * Reads one `--palette-*` declaration's value for one theme. Each value in
 * `palette.css` is a `light-dark()` pair, or a single value both themes share.
 * @param paletteText Contents of `packages/styles/src/palette.css`.
 * @param name Declaration name without its `--palette-` prefix.
 * @param theme `"light"` or `"dark"`.
 * @returns The declaration's value in that theme.
 */
function readPaletteValue(paletteText, name, theme) {
  const match = paletteText.match(new RegExp(`--palette-${name}:\\s*([^;]+);`));
  if (!match) {
    throw new Error(`palette.css has no --palette-${name} declaration -- has the palette's naming changed?`);
  }
  return splitLightDark(match[1].replace(/\s+/g, " ").trim())[theme];
}

/**
 * Reads one theme block's raw, uncomposed inputs: an accent, contrast, and
 * strong tone per named severity; the flat neutral tokens a "default"
 * severity and dialog surface/text/border read; and an accent/contrast/hover
 * per button role.
 * @param paletteText Contents of `packages/styles/src/palette.css`.
 * @param theme `"light"` or `"dark"`.
 * @returns Flat `{ name: value }` map, keyed the same way {@link buildTheme} expects.
 */
function readRawValues(paletteText, theme) {
  const block = paletteText;
  const raw = {};
  for (const severity of NAMED_SEVERITIES) {
    // Uncapped intent (fill-max 100%): the "solid" cell IS the accent and
    // contrast color, with no fill or ground mixed in to recover from.
    raw[`${severity}-color`] = readPaletteValue(block, `${severity}-solid-bg`, theme);
    raw[`${severity}-contrast`] = readPaletteValue(block, `${severity}-solid-fg`, theme);
    // The "soft" cell's foreground is the strong tone at any fill at or
    // under 50%, styles.css `box`'s own on-fill formula.
    raw[`${severity}-strong`] = readPaletteValue(block, `${severity}-soft-fg`, theme);
  }
  // Neutral maps its color to the flat text token and its border to the flat
  // border token -- the two differ, unlike a named severity's own intent
  // mapping its border to its color.
  raw["neutral-color"] = readPaletteValue(block, "text", theme);
  raw["neutral-border"] = readPaletteValue(block, "border", theme);
  raw["neutral-strong"] = readPaletteValue(block, "neutral-soft-fg", theme);
  raw["neutral-contrast"] = readPaletteValue(block, "neutral-solid-fg", theme);
  for (const role of BUTTON_ROLES) {
    raw[`btn-${role}-color`] = readPaletteValue(block, `${role}-solid-bg`, theme);
    raw[`btn-${role}-contrast`] = readPaletteValue(block, `${role}-solid-fg`, theme);
    raw[`btn-${role}-hover`] = readPaletteValue(block, `${role}-solid-bg-hover`, theme);
  }
  raw.surface = readPaletteValue(block, "surface", theme);
  raw.text = readPaletteValue(block, "text", theme);
  raw.border = readPaletteValue(block, "border", theme);
  return raw;
}

/**
 * Assembles one theme's `--toast-default-*` values from its own raw inputs
 * and the *other* theme's raw text color -- `--color-background` is not its
 * own palette cell, but is always the opposite theme's `--color-text`
 * (styles.css's `theme.css` defines the two as the same neutral pair, read
 * in opposite order).
 * @param raw This theme's raw inputs from {@link readRawValues}.
 * @param otherThemeText The other theme's raw `text` value.
 * @returns Flat `{ name: value }` map, keyed the way {@link renderCss} expects.
 */
function buildTheme(raw, otherThemeText) {
  const values = {};
  for (const severity of [...NAMED_SEVERITIES, "neutral"]) {
    values[`color-${severity}`] = raw[`${severity}-color`];
    values[`color-${severity}-contrast`] = raw[`${severity}-contrast`];
    values[`color-${severity}-strong`] = raw[`${severity}-strong`];
  }
  values["color-neutral-border"] = raw["neutral-border"];
  for (const role of BUTTON_ROLES) {
    values[`color-btn-${role}`] = raw[`btn-${role}-color`];
    values[`color-btn-${role}-contrast`] = raw[`btn-${role}-contrast`];
    values[`color-btn-${role}-hover`] = raw[`btn-${role}-hover`];
  }
  values["color-surface"] = raw.surface;
  values["color-text"] = raw.text;
  values["color-border"] = raw.border;
  values["color-background"] = otherThemeText;
  return values;
}

/**
 * Builds the generated CSS: toaster's own `--toast-default-*` custom
 * properties, each declared once with `light-dark()` against this theme's
 * own light and dark raw inputs, plus the `color-scheme` scaffolding that
 * makes `light-dark()` resolve correctly.
 *
 * Mirrors `@codenhub/styles`' own `theme.css` mechanism exactly, for the
 * same reason: a two-block approach (light values at `:root`, dark values
 * under `.dark`) has no way to reset a `.light` section nested inside a
 * `.dark` ancestor back to light, since a custom property with no own
 * declaration simply inherits whatever an ancestor set. `light-dark()`
 * sidesteps that: it is declared once, and resolves per element against
 * that element's own computed `color-scheme` -- which the three `color-scheme`
 * declarations below set correctly at any nesting depth, because
 * `color-scheme` is an ordinary inherited property and an element's own
 * declaration always wins over an inherited one.
 * @param light Light-theme values from {@link buildTheme}.
 * @param dark Dark-theme values from {@link buildTheme}, same keys as `light`.
 * @returns The full `generated-defaults.css` file contents.
 */
function renderCss(light, dark) {
  const lines = Object.keys(light)
    .map((name) => `  --toast-default-${name}: light-dark(${light[name]}, ${dark[name]});`)
    .join("\n");

  return [
    "/* Generated by `pnpm generate` from `@codenhub/styles`, through",
    "   `scripts/generate-toast-defaults.mjs`. Do not hand-edit -- these are",
    "   this package's own baked-in, uncomposed color inputs, read from the",
    "   real `@codenhub/styles` palette so a toast or dialog rendered with no",
    "   `@codenhub/styles` on the page still composes against the real thing",
    "   instead of a hand-typed guess. `src/styles/index.css` runs the same",
    "   composition formula against these that it runs against",
    "   `@codenhub/styles`' own live tokens.",
    "",
    "   Each value is declared once with `light-dark()`, matching",
    "   `@codenhub/styles`' own `theme.css`: it resolves at the point of use",
    "   against the consuming element's own computed `color-scheme`, which is",
    "   what lets a nested `.light` section inside a `.dark` ancestor (or the",
    "   reverse) resolve correctly with no per-element redeclaration. */",
    "",
    ":root {",
    "  /* Both keywords: the system preference decides, and the explicit theme",
    "     selectors below override it at any depth because `color-scheme`",
    "     inherits -- same contract as `@codenhub/styles`' own `theme.css`. */",
    "  color-scheme: light dark;",
    "",
    lines,
    "}",
    "",
    ".light,",
    ".theme-light,",
    '[data-theme="light"] {',
    "  color-scheme: light;",
    "}",
    "",
    ".dark,",
    ".theme-dark,",
    '[data-theme="dark"] {',
    "  color-scheme: dark;",
    "}",
    "",
  ].join("\n");
}

/**
 * Formats CSS text through `oxfmt`, the same formatter `hub format` runs
 * for every CSS file in the repository, so a long `light-dark(...)`
 * declaration wraps exactly the way `pnpm format:fix` would wrap it and the
 * drift check this generator's `--dry-run` performs never disagrees with
 * what is actually on disk.
 * @param css Raw, unformatted CSS text.
 * @param workspaceRoot Repository root `oxfmt`'s dependency is resolved from.
 * @returns The formatted CSS text.
 */
async function formatCss(css, workspaceRoot) {
  return new Promise((resolve, reject) => {
    // `pnpm` is a `.cmd` shim on Windows, which `spawn` cannot run directly
    // without a shell. The whole command is one fixed, argument-free string
    // (nothing here is caller-controlled), so shelling out has nothing to
    // escape and needs no argument array, avoiding Node's shell+args warning.
    const child = spawn("pnpm exec oxfmt --stdin-filepath=generated-defaults.css", {
      cwd: workspaceRoot,
      shell: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`oxfmt exited with code ${code}: ${stderr}`));
        return;
      }
      resolve(stdout);
    });
    child.stdin.end(css);
  });
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  const workspaceRoot = await findWorkspaceRoot(packageRoot);
  const stylesRoot = path.join(workspaceRoot, "packages", "styles");

  const paletteText = await readFile(path.join(stylesRoot, "src", "palette.css"), "utf8");

  console.error("Reading raw color inputs from the real palette.css...");
  const lightRaw = readRawValues(paletteText, "light");
  const darkRaw = readRawValues(paletteText, "dark");
  const light = buildTheme(lightRaw, darkRaw.text);
  const dark = buildTheme(darkRaw, lightRaw.text);

  const generatedPath = "src/styles/generated-defaults.css";
  const rendered = renderCss(light, dark);
  const output = await formatCss(rendered, workspaceRoot);
  const [outcome] = await applyGenerated([{ contents: output, path: generatedPath }], {
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
