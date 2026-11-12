import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { canMatch, classesOf, format, parse, purge, serialize } from "../../src/cli/purge";

const packageRoot = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => readFile(path.resolve(packageRoot, file), "utf8");
const purged = (css: string, ...used: string[]) => serialize(purge(parse(css), new Set(used)));

describe("canMatch", () => {
  const used = new Set(["btn", "primary", "md:lg"]);

  it.each([
    [".btn", true],
    [".btn.primary", true],
    [".btn.soft", false],
    [".card .btn", false],
    ["button", true],
    // A class inside `:not()` is one the element must not have, so it is never required.
    [".btn:not(.disabled)", true],
    [":where(.stack:not(.tight))", false],
    // One branch is enough.
    [":is(.card,.btn)", true],
    [":where(.card,.panel)", false],
    [".btn:has(>.icon)", false],
    [":is(.card,.btn):not(.soft):hover", true],
    // An escaped class name, as a variant is written.
    [String.raw`.md\:lg`, true],
    [String.raw`.md\:sm`, false],
    // Not classes: a number, an attribute value, a string.
    ['[data-x=".card"]', true],
    ["a[href$=.pdf]", true],
  ])("%s -> %s", (selector, expected) => {
    expect(canMatch(selector, used)).toBe(expected);
  });
});

describe("purge", () => {
  it("drops a rule no used class can match and keeps the rest", () => {
    expect(purged(".btn{color:red}.card{color:blue}p{margin:0}", "btn")).toBe(".btn{color:red}p{margin:0}");
  });

  it("keeps only the selectors of a list that can match", () => {
    expect(purged(".btn,.card,a{color:red}", "btn")).toBe(".btn,a{color:red}");
  });

  it("keeps an emptied layer where it stands, since that fixes the layer order", () => {
    expect(purged("@layer components{.card{color:blue}}@layer utilities{.btn{color:red}}", "btn")).toBe(
      "@layer components{}@layer utilities{.btn{color:red}}",
    );
  });

  it("drops a media block left with nothing but empty layers", () => {
    expect(purged("@media (min-width:48rem){@layer families{.card{color:blue}}}.btn{color:red}", "btn")).toBe(
      ".btn{color:red}",
    );
  });

  it("keeps at-rules that hold no selectors whole", () => {
    const css = '@property --x{syntax:"*";inherits:false}@keyframes spin{to{rotate:1turn}}';

    expect(purged(css)).toBe(css);
  });

  it("reads braces and semicolons inside a string or a url as text", () => {
    const css = '.btn{content:"};.card{";background:url("data:image/svg+xml;utf8,<svg>{}</svg>")}.card{color:blue}';

    expect(purged(css, "btn")).toBe(css.slice(0, css.indexOf(".card{color")));
  });

  // The package's licence notice follows Tailwind's banner on a line of its own.
  it("reads a comment after a newline as a comment, not as the next prelude", () => {
    const css = "/*! banner */\n/*! notice */@layer theme{.card{color:red}}@layer components{.btn{color:blue}}";

    expect(parse(css).map((node) => node.kind)).toEqual(["statement", "statement", "group", "group"]);
    expect(purged(css, "btn")).toBe("/*! banner */\n/*! notice */@layer theme{}@layer components{.btn{color:blue}}");
  });

  it("reads an escape outside Unicode as U+FFFD rather than throwing", () => {
    expect(canMatch(String.raw`.\FFFFFF`, new Set(["�"]))).toBe(true);
    expect(canMatch(String.raw`.\0 x`, new Set(["�x"]))).toBe(true);
  });
});

describe("the stylesheets the command reads", () => {
  it.each([
    "dist/purge/index.css",
    "dist/aesthetics/neobrutalism.css",
    "dist/aesthetics/glass.css",
    "dist/aesthetics/pixel.css",
    "dist/aesthetics/chunky-tile.css",
    "dist/aesthetics/cyber.css",
    "dist/aesthetics/sketch.css",
  ])("%s parses and writes back to the same bytes", async (file) => {
    const css = await read(file);

    expect(serialize(parse(css))).toBe(css);
  });

  it.each(["dist/purge/index.css", "dist/index.css"])("%s parses no at-rule as a style rule", async (file) => {
    const misread = parse(await read(file)).filter(
      (node) => node.kind === "block" && node.isRule && node.prelude.includes("@"),
    );

    expect(misread.map((node) => (node.kind === "block" ? node.prelude.slice(-40) : ""))).toEqual([]);
  });

  it("the source purged to the complete stylesheet's classes is the complete stylesheet", async () => {
    const complete = await read("dist/index.css");

    expect(serialize(purge(parse(await read("dist/purge/index.css")), classesOf(parse(complete))))).toBe(complete);
  });

  it("every class the command may drop is in the source, and every other class is one a page gets at run time", async () => {
    const droppable = new Set(JSON.parse(await read("dist/purge/classes.json")) as string[]);
    const inSource = classesOf(parse(await read("dist/purge/index.css")));

    expect([...droppable].filter((name) => !inSource.has(name))).toEqual([]);
    expect([...inSource].filter((name) => !droppable.has(name)).sort()).toEqual([
      "dark",
      "disabled",
      "light",
      "theme-dark",
      "theme-light",
    ]);
  });

  it("offers each variant on the axis classes", async () => {
    const droppable = JSON.parse(await read("dist/purge/classes.json")) as string[];

    for (const variant of ["sm", "md", "lg", "xl", "2xl", "hover", "focus", "focus-visible", "active", "dark"]) {
      expect(droppable).toEqual(expect.arrayContaining([`${variant}:primary`, `${variant}:soft`, `${variant}:lg`]));
    }
  });
});

describe("format", () => {
  it("writes one declaration to a line", () => {
    expect(format(parse("@layer a{.btn,.card{color:red;margin:0}}"))).toBe(
      "@layer a {\n  .btn,\n  .card {\n    color:red;\n    margin:0;\n  }\n}\n",
    );
  });
});
