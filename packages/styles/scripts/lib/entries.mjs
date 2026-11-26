/**
 * The compiled entrypoints: what `build-styles.mjs` writes into `dist/`, and
 * what `tests/integration/adapter.test.ts` compiles from `tw/` to hold the
 * two paths to the same bytes.
 *
 * - `omit` names the utilities an entry leaves out of the ones its files
 *   define, given `{ name, file }`, `file` relative to `src/`.
 * - `head` marks a complete stylesheet, which starts with the package's head
 *   comment; see `scripts/head.mjs`.
 * - `tw` is what a consumer imports to get the same stylesheet from `/tw`,
 *   relative to `tw/`, or a bare specifier; `null` where `/tw` has no
 *   counterpart. The palette is the colour ramp alone, outside the theme.
 */
import { readFileSync } from "node:fs";

const registry = JSON.parse(readFileSync(new URL("../../registry.json", import.meta.url), "utf8"));

/* `components.css` leaves out the layout and rule modifiers, which modify the
   layout utilities and data tables it does not ship. */
const LAYOUT_MODIFIERS = new Set([...registry.modifiers.layout, ...registry.modifiers.rule]);

export const STYLES_ENTRIES = [
  { input: "src/index.css", output: "dist/index.css", head: true, tw: ["index.css"] },
  /* `/theme` carries the class families and none of the modifiers, which
     modify components it does not ship. */
  {
    input: "src/theme.compiled.css",
    output: "dist/theme.css",
    omit: ({ file }) => file === "modifiers.css",
    tw: ["theme.css", "tailwindcss/utilities.css layer(utilities)"],
  },
  { input: "src/palette.css", output: "dist/palette.css", tw: null },
  {
    input: "src/components/index.css",
    output: "dist/components.css",
    head: true,
    omit: ({ name }) => LAYOUT_MODIFIERS.has(name),
    tw: ["components/index.css"],
  },
  { input: "src/native.css", output: "dist/native.css", head: true, tw: ["native.css"] },
];

export const AESTHETICS_ENTRIES = ["index", "neobrutalism", "glass", "pixel", "chunky-tile", "cyber", "sketch"].map(
  (name) => ({
    input: `src/aesthetics/${name}.css`,
    output: `dist/aesthetics/${name}.css`,
    tw: [`aesthetics/${name}.css`],
  }),
);
