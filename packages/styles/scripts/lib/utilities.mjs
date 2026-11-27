/**
 * The Tailwind utilities the generator writes for a project that does not run
 * Tailwind: a closed list, with Tailwind's names, chosen as
 * `docs/internal/generator.md` records ("The list, and how it is checked").
 * Tailwind 4 accepts any spacing number, so `mt-13` compiles there; here a
 * class is written only when it is named below.
 *
 * `scripts/build-utilities.mjs` compiles every name with Tailwind and fails on
 * one Tailwind does not compile, so a typo here cannot ship.
 */

/* The spacing steps, as Tailwind writes them. The halves (0.5, 1.5, 2.5, 3.5)
   wait until the scan finds a class with a dot (generator.md, "No decimals or
   fractions in the first release"). */
const STEPS = [
  ...Array.from({ length: 13 }, (_, index) => String(index)),
  "14",
  "16",
  "20",
  "24",
  "28",
  "32",
  "36",
  "40",
  "44",
  "48",
  "52",
  "56",
  "60",
  "64",
  "72",
  "80",
  "96",
  "px",
];

const range = (prefix, from, to) => Array.from({ length: to - from + 1 }, (_, index) => `${prefix}${from + index}`);
const each = (prefixes, values) => prefixes.flatMap((prefix) => values.map((value) => `${prefix}-${value}`));

const PADDING = ["p", "px", "py", "pt", "pr", "pb", "pl", "ps", "pe"];
const MARGIN = ["m", "mx", "my", "mt", "mr", "mb", "ml", "ms", "me"];
const GAP = ["gap", "gap-x", "gap-y"];
const OFFSETS = ["inset", "inset-x", "inset-y", "top", "right", "bottom", "left"];
const SIZES = ["w", "h", "min-w", "min-h", "max-w", "max-h"];

const ALIGN = ["start", "end", "center", "stretch", "baseline"];
const SAFE = ["center-safe", "end-safe"];
const DISTRIBUTE = ["between", "around", "evenly"];
const OVERFLOW = ["auto", "hidden", "clip", "visible", "scroll"];

export const UTILITIES = [
  // Display.
  "block",
  "inline-block",
  "inline",
  "flex",
  "inline-flex",
  "grid",
  "hidden",

  // Flex and grid layout.
  "flex-row",
  "flex-col",
  "flex-wrap",
  "flex-1",
  "grow",
  "shrink-0",
  ...range("grid-cols-", 1, 12),
  ...range("col-span-", 1, 12),

  // Alignment, with every keyword Tailwind gives each family.
  ...each(["items"], [...ALIGN, "baseline-last", ...SAFE]),
  ...each(["justify"], ["start", "end", "center", "stretch", "baseline", "normal", ...DISTRIBUTE, ...SAFE]),
  ...each(["justify-items"], ["start", "end", "center", "stretch", "normal", ...SAFE]),
  ...each(["justify-self"], ["auto", "start", "end", "center", "stretch", ...SAFE]),
  ...each(["self"], ["auto", ...ALIGN, "baseline-last", ...SAFE]),
  ...each(["place-content"], [...ALIGN, ...DISTRIBUTE, ...SAFE]),
  ...each(["place-items"], [...ALIGN, ...SAFE]),
  ...each(["place-self"], ["auto", "start", "end", "center", "stretch", ...SAFE]),
  ...each(["content"], [...ALIGN, "normal", ...DISTRIBUTE, ...SAFE]),

  // Sizing keywords.
  "w-full",
  "w-auto",
  "w-screen",
  "h-full",
  "h-auto",
  "h-screen",
  // min-w-0 is a spacing step below.
  "min-h-screen",

  // Position and overflow.
  "static",
  "relative",
  "absolute",
  "fixed",
  "sticky",
  ...each(["overflow", "overflow-x", "overflow-y"], OVERFLOW),

  // Spacing, and the sizing utilities that take a spacing value.
  ...each([...PADDING, ...MARGIN, ...GAP, ...OFFSETS, ...SIZES], STEPS),
  ...each(MARGIN, ["auto"]),

  // Type and width, by Tailwind's theme keys.
  "text-left",
  "text-center",
  "text-right",
  "text-justify",
  ...each(["text"], ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl", "8xl", "9xl"]),
  ...each(["font"], ["sans", "serif", "mono"]),
  ...each(["font"], ["thin", "extralight", "light", "normal", "medium", "semibold", "bold", "extrabold", "black"]),
  ...each(["leading"], ["tight", "snug", "normal", "relaxed", "loose"]),
  ...each(["tracking"], ["tighter", "tight", "normal", "wide", "wider", "widest"]),
  ...each(["max-w"], ["3xs", "2xs", "xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl"]),
  "underline",
  "no-underline",
];

/* The variants a class takes without Tailwind, one at a time: the package's
   axis and modifier classes, compiled ahead into `dist/purge/index.css` by
   `build-purge.mjs`, and the utilities above. Each costs `build-purge.mjs` its
   copy of every axis class, about 3 KB minified for the axis classes alone, so
   the list is the common ones rather than all of Tailwind's: 52 of its variants
   measured 197 KB, and stacking breakpoints on states another 845 KB. A project
   that needs another variant, or two stacked, compiles `/tw` with Tailwind. */
export const VARIANTS = ["sm", "md", "lg", "xl", "2xl", "hover", "focus", "focus-visible", "active", "dark"];
