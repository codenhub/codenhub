import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { expect, test } from "vitest";

interface PackageManifest {
  exports: Record<string, string | Record<string, string>>;
}

interface TailwindExportContract {
  candidates?: string;
  patterns: RegExp[];
}

interface CompiledExportContract {
  target: string;
  patterns: RegExp[];
}

const executeFile = promisify(execFile);
const packagePath = fileURLToPath(new URL("../../package.json", import.meta.url));
const packageRoot = path.dirname(packagePath);
const manifest = JSON.parse(await readFile(packagePath, "utf8")) as PackageManifest;
const exportTargets = Object.entries(manifest.exports).flatMap(([exportName, target]) =>
  typeof target === "string"
    ? [{ exportName, target }]
    : Object.entries(target).map(([condition, conditionTarget]) => ({
        exportName: `${exportName} (${condition})`,
        target: conditionTarget,
      })),
);
const tailwindCliPath = fileURLToPath(
  new URL("./dist/index.mjs", import.meta.resolve("@tailwindcss/cli/package.json")),
);
const tailwindCssUrl = new URL("./index.css", import.meta.resolve("tailwindcss/package.json")).href;
const tailwindExportContracts: Record<string, TailwindExportContract> = {
  "./tw": {
    candidates: "btn",
    patterns: [/\.btn\{[^}]*--_capped:/, /\.btn\{[^}]*background-color:var\(--_bg\)/],
  },
  /* `dark:` compiles to two independent arms -- an explicit selector and a
     system-preference fallback excluded from a forced-light subtree -- so a
     single candidate has to prove both are present rather than just that the
     variant exists at all. */
  "./tw/theme": {
    candidates: "dark:hidden",
    patterns: [
      /--color-primary:/,
      /\.dark\\:hidden:where\(\.dark,\.dark \*,\.theme-dark,\.theme-dark \*,\[data-theme=dark\],\[data-theme=dark\] \*\)/,
      /@media \(prefers-color-scheme:dark\)\{\.dark\\:hidden:not\(:where\(\.light,\.light \*,\.theme-light,\.theme-light \*,\[data-theme=light\],\[data-theme=light\] \*\)\)/,
    ],
  },
  "./tw/components": {
    candidates: "alert btn alert-icon",
    patterns: [/\.alert\{[^}]*--_capped:/, /\.btn\{[^}]*--_capped:/, /\.alert-icon\{/],
  },
  "./tw/surface": {
    candidates: "panel",
    patterns: [/\.panel\{[^}]*--_capped:/, /backdrop-filter:var\(--ui-backdrop,none\)/],
  },
  "./tw/button": {
    candidates: "btn",
    patterns: [/\.btn\{[^}]*--_capped:/, /\.btn\{[^}]*background-color:var\(--_bg\)/],
  },
  "./tw/form": {
    candidates: "ipt radio",
    patterns: [/\.ipt\{[^}]*--_capped:/, /\.radio\{[^}]*--_capped:/, /background-color:var\(--_bg\)/],
  },
  "./tw/feedback": {
    candidates: "alert badge progress",
    patterns: [/\.alert\{[^}]*--_capped:/, /\.badge\{[^}]*--_capped:/, /\.progress\{/],
  },
  "./tw/loader": {
    candidates: "loader dots-wave",
    patterns: [/\.loader/, /\.dots-wave/, /mask-image:/],
  },
  "./tw/tooltip": {
    candidates: "tooltip tooltip-bubble tooltip-icon",
    patterns: [
      /\.tooltip\{/,
      /\.tooltip-bubble\{[^}]*--_capped:/,
      /\.tooltip-icon\{[^}]*--_capped:/,
      /background-color:var\(--_bg\)/,
    ],
  },
  "./tw/reset": { candidates: "text-body", patterns: [/:focus-visible\{/] },
  "./tw/native": { candidates: "btn", patterns: [/h1\{/, /button,/] },
  "./tw/typography": { candidates: "text-title", patterns: [/\.text-title\{/] },
  "./tw/utilities": {
    candidates: "stack data-table",
    patterns: [/\.stack\{/, /\.data-table\{/, /--_capped:/, /background-color:var\(--_bg\)/],
  },
  "./tw/aesthetics": {
    patterns: [/\.neobrutalism\{/, /\.glass\{/, /\.pixel\{/, /\.chunky-tile\{/, /\.cyber\{/],
  },
  "./tw/aesthetics/neobrutalism": { patterns: [/\.neobrutalism\{/, /--ui-shadow-x:/, /--ui-ink:/] },
  "./tw/aesthetics/glass": { patterns: [/\.glass\{/, /--ui-backdrop:/, /--glass-radius,/] },
  /* The bar is a shade of the element rather than a repeat of it, which takes the
     opaque depth colour as well as the ink amount. Both are asserted because
     either one alone leaves the bar invisible. */
  "./tw/aesthetics/chunky-tile": {
    patterns: [/\.chunky-tile\{/, /--tile-radius,/, /--elevation-color:/, /--ui-shadow-ink:/, /--ui-active-transform:/],
  },
  /* The bevel is a corner shape rather than a clip, and it has to fall back to a
     square where an engine cannot draw it; both halves are asserted. */
  "./tw/aesthetics/cyber": {
    patterns: [/\.cyber\{/, /--cyber-cut,/, /--ui-corner-shape:\s*bevel/, /@supports not \(corner-shape:\s*bevel\)/],
  },
  /* The aesthetic publishes the silhouette and the inset edge as material
     tokens; the declarations that consume them belong to `box` and `surface`. */
  "./tw/aesthetics/pixel": {
    patterns: [
      /\.pixel\{/,
      /--ui-clip:\s*polygon/,
      /--ui-clip-tight:\s*none/,
      /--ui-shadow-edge:/,
      /--ui-shadow-inset:/,
    ],
  },
};
const compiledExportContracts: Record<string, CompiledExportContract> = {
  ".": {
    target: "dist/index.css",
    patterns: [/--color-primary:/, /\.btn\{/, /\.stack\{/, /--_capped:/],
  },
  "./theme": { target: "dist/theme.css", patterns: [/--color-primary:/, /\.soft\{/] },
  "./palette": {
    target: "dist/palette.css",
    patterns: [
      /--palette-primary-solid-bg:/,
      /--palette-success-soft-page-bg:/,
      /--palette-info-ghost-subtle-edge:/,
      /--palette-border:/,
      /--palette-surface:/,
      /--palette-text:/,
    ],
  },
  "./components": {
    target: "dist/components.css",
    patterns: [
      /\.alert\{/,
      /\.btn\{/,
      /\.panel\{/,
      /\.field\{/,
      /\.loader\{/,
      /\.text-title\{/,
      /\.tooltip\{/,
      /\.tooltip-bubble\{/,
      /--_capped:/,
    ],
  },
  "./native": { target: "dist/native.css", patterns: [/button,/, /h1\{/, /\.btn\{/] },
  "./aesthetics": {
    target: "dist/aesthetics/index.css",
    patterns: [/\.neobrutalism\{/, /\.glass\{/, /\.pixel\{/, /\.chunky-tile\{/, /\.cyber\{/],
  },
  "./aesthetics/neobrutalism": {
    target: "dist/aesthetics/neobrutalism.css",
    patterns: [/\.neobrutalism\{/, /--ui-shadow-x:/],
  },
  "./aesthetics/glass": {
    target: "dist/aesthetics/glass.css",
    patterns: [/\.glass\{/, /--ui-backdrop:/, /prefers-reduced-transparency/],
  },
  "./aesthetics/pixel": {
    target: "dist/aesthetics/pixel.css",
    patterns: [/\.pixel\{/, /--ui-clip:polygon/, /--ui-shadow-inset:/],
  },
  "./aesthetics/chunky-tile": {
    target: "dist/aesthetics/chunky-tile.css",
    patterns: [/\.chunky-tile\{/, /--elevation-color:/, /--ui-shadow-ink:/, /--ui-active-transform:/],
  },
  "./aesthetics/cyber": {
    target: "dist/aesthetics/cyber.css",
    patterns: [/\.cyber\{/, /--ui-corner-shape:bevel/, /@supports not \(corner-shape:bevel\)/],
  },
};
const aggregateExportTargets = ["dist/components.css", "dist/index.css"];
const representativePublicRules = [".box{--_fill-cap:100%;--_capped:"];

test("every declared package export target exists after build", async () => {
  await Promise.all(
    exportTargets.map(({ exportName, target }) =>
      expect(
        readFile(path.resolve(packageRoot, target)),
        `expected ${exportName} target ${target} to exist`,
      ).resolves.toBeDefined(),
    ),
  );
});

/* An HTML `<style>` element ends at the first `</style`, whatever CSS token it
   sits in, so a stylesheet inlined into a page would drop every rule after one.
   Every CSS file under `dist/` ships -- the compiled entries and the `/tw`
   sources alike -- so every one is checked, not just the export targets. */
test("no shipped stylesheet contains a sequence that ends an inline style element", async () => {
  const distRoot = path.resolve(packageRoot, "dist");
  const stylesheets = (await readdir(distRoot, { recursive: true })).filter((file) => file.endsWith(".css"));
  const outputs = await Promise.all(stylesheets.map((file) => readFile(path.join(distRoot, file), "utf8")));
  const unsafe = stylesheets
    .filter((_, index) => /<\/style/i.test(outputs[index]!))
    .map((file) => `dist/${file.replaceAll("\\", "/")}`);

  expect(stylesheets.length).toBeGreaterThan(0);
  expect(unsafe).toEqual([]);
});

for (const [exportName, contract] of Object.entries(compiledExportContracts)) {
  test(`${exportName} compiled export contains its representative public surface`, async () => {
    const output = await readFile(path.resolve(packageRoot, contract.target), "utf8");

    for (const pattern of contract.patterns) {
      expect(output, `${exportName} should contain ${pattern}`).toMatch(pattern);
    }
  });
}

/* Cascade layers (docs/internal/cascade-layers.md). A browser orders layers by
   the first time it meets each name, so every compiled entrypoint has to name
   the package's four in Tailwind's order before it uses one -- a sheet that
   opened `components` first would rank it below `theme` and `base` when loaded
   on its own. `properties` is Tailwind's `@property` fallback layer and sits
   wherever Tailwind puts it. */
const LAYER_ORDER = ["theme", "base", "components", "utilities"];

function firstLayerOrder(css: string): string[] {
  const names = [...css.matchAll(/@layer\s+([a-z][a-z0-9.,\s-]*?)\s*[;{]/g)].flatMap((match) =>
    match[1]!.split(",").map((name) => name.trim()),
  );

  return [...new Set(names)].filter((name) => name !== "properties");
}

/* Every style rule that sits in no `@layer`, with the at-rules around it. A
   brace walk over the minified output, skipping quoted strings so a data URI
   cannot open or close a block. */
function unlayeredRules(source: string): { context: string; selector: string }[] {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: { context: string; selector: string }[] = [];
  const stack: string[] = [];
  let buffer = "";
  let quote: string | null = null;

  for (let index = 0; index < css.length; index++) {
    const character = css[index]!;

    if (quote) {
      buffer += character;
      if (character === quote && css[index - 1] !== "\\") {
        quote = null;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
      buffer += character;
    } else if (character === "{") {
      const head = buffer.trim();
      const inStyleRule = stack.some((entry) => !entry.startsWith("@"));
      const inLayer = stack.some((entry) => entry.startsWith("@layer"));

      if (!head.startsWith("@") && !inStyleRule && !inLayer) {
        rules.push({ context: stack.join(" > "), selector: head });
      }
      stack.push(head);
      buffer = "";
    } else if (character === "}") {
      stack.pop();
      buffer = "";
    } else if (character === ";") {
      buffer = "";
    } else {
      buffer += character;
    }
  }

  return rules;
}

/* What may stay unlayered, each because it has to beat every layer: the
   `forced-colors` and reduced-motion accessibility overrides, the closed and
   open `<dialog>` restatements that must beat `.card`'s own `display`, and the
   solo classes, which must beat a foreign component's unlayered CSS. Keyframe
   steps are not style rules at all. Anything else unlayered beats a consumer's
   utility, which is the thing the layer map exists to stop. */
const UNLAYERED_ALLOWED: { reason: string; matches: (rule: { context: string; selector: string }) => boolean }[] = [
  { reason: "keyframe step", matches: (rule) => rule.context.startsWith("@keyframes") },
  { reason: "forced-colors override", matches: (rule) => rule.context.includes("forced-colors:active") },
  {
    reason: "reduced-motion loader art",
    matches: (rule) =>
      rule.context.includes("prefers-reduced-motion:reduce") &&
      /^\.(?:loader|dots?-[a-z-]+|bars-wave|pulse-ring)(?:,|$)/.test(rule.selector),
  },
  { reason: "dialog restatement", matches: (rule) => /^dialog(?::not\(\[open\]\)|\[open\])$/.test(rule.selector) },
  { reason: "solo class", matches: (rule) => /-solo\b/.test(rule.selector) },
];

const compiledTargets = [...new Set(Object.values(compiledExportContracts).map((contract) => contract.target))];

for (const target of compiledTargets) {
  test(`${target} declares the package's layer order before using a layer`, async () => {
    const output = await readFile(path.resolve(packageRoot, target), "utf8");

    expect(firstLayerOrder(output)).toEqual(LAYER_ORDER);
  });

  test(`${target} leaves nothing unlayered but the allowlist`, async () => {
    const output = await readFile(path.resolve(packageRoot, target), "utf8");
    const stray = unlayeredRules(output).filter((rule) => !UNLAYERED_ALLOWED.some((allowed) => allowed.matches(rule)));

    expect(
      stray.map((rule) => `${rule.context || "(top level)"} :: ${rule.selector}`),
      `${target} has unlayered rules outside the allowlist`,
    ).toEqual([]);
  });
}

/* The contracts above spot-check a handful of classes per entrypoint. A
   compiled bundle has no markup to scan, so a `@utility` emits only because the
   self-scan or an `@source inline` in that entrypoint's index names it -- and a
   new component added to `src/components/` that is missed in the inline list
   ships absent from `dist/components.css` with nothing failing, the mirror of
   the `.table` collision. This holds every `@utility` a compiled entrypoint's
   own source tree defines against its output.

   `roots` is the entrypoint's import closure, not just its directory: the
   `dist/components.css` index pulls `../box.css` and `../typography.css`
   alongside `./`, and a utility added to either belongs in that bundle. A
   functional `@utility name-*` keeps its trailing `*` so the match below can
   look for `.name-<value>` rather than a bare `.name`. */
async function definedUtilities(roots: string[]): Promise<string[]> {
  const perRoot = await Promise.all(
    roots.map(async (root) => {
      const absolute = path.resolve(packageRoot, root);

      if (root.endsWith(".css")) {
        return [await readFile(absolute, "utf8")];
      }
      const files = (await readdir(absolute, { recursive: true })).filter(
        (entry): entry is string => typeof entry === "string" && entry.endsWith(".css"),
      );

      return Promise.all(files.map((file) => readFile(path.join(absolute, file), "utf8")));
    }),
  );

  return [
    ...new Set(
      perRoot
        .flat()
        .flatMap((source) => [...source.matchAll(/@utility\s+([a-z][a-z0-9-]*\*?)\s*\{/g)].map((match) => match[1])),
    ),
  ];
}

const compiledCompleteness: Record<string, string[]> = {
  "dist/index.css": ["src"],
  "dist/components.css": ["src/components", "src/box.css", "src/typography.css", "src/theme.css"],
  "dist/native.css": ["src"],
};

for (const [target, roots] of Object.entries(compiledCompleteness)) {
  test(`${target} emits every @utility its source tree defines`, async () => {
    const output = await readFile(path.resolve(packageRoot, target), "utf8");
    const missing = (await definedUtilities(roots)).filter((name) => {
      /* A functional `@utility foo-*` emits as `.foo-<value>`; a static one as a
         bare `.foo`. The `*` is carried through so the two are told apart here. */
      const pattern = name.endsWith("*") ? String.raw`\.${name.slice(0, -1)}[a-z0-9]` : String.raw`\.${name}(?![\w-])`;

      return !new RegExp(pattern).test(output);
    });

    expect(missing, `${target} is missing rules for: ${missing.join(", ")}`).toEqual([]);
  });
}

/* The check above only asks whether a utility's name appears anywhere in the
   output, which a class inside an `:is()`/`:where()` argument list already
   satisfies -- `.input-group).soft{` passes it without `input-group`'s own
   `@utility` body ever compiling. That gap is exactly how `.input-group`,
   `.text-control`, and `.surface` went dark when the docs prose that was
   accidentally naming them was excluded from the content scan: every existing
   assertion here still passed, and only the browser suite caught it. The seven
   composition utilities are the ones at risk -- unlike a component class, they
   never appear as the selector of a rule of their own except through the
   `@source inline` safelist in `components/index.css` -- so this holds each to
   emitting a real rule. */
const COMPOSITION_UTILITIES = [
  "box",
  "box-hover",
  "box-active",
  "loader-mask",
  "text-control",
  "surface",
  "input-group",
];

/* True when `name` starts a rule of its own in `output`: immediately followed
   by `{` (its base declarations) or `:` (a pseudo-class state, the only form
   `box-hover` and `box-active` ever compile as -- `.box-hover:not(...):hover{`,
   never a bare `.box-hover{`). A comma, a compound-class `.`, a bracket, a
   space, or a combinator after the name does not qualify: `.input-group.soft{`
   is a modifier rule that only fires alongside `input-group`'s own body, and
   `.input-group .child{` styles a descendant, neither of which proves
   `input-group`'s own `@utility` block compiled. The name may be preceded by
   the start of the string, a previous rule closing (`}`), a sibling in a
   comma-separated selector list (`,`), or the opening of an enclosing block
   such as `@media (forced-colors: active) {` (`{`). */
function emitsOwnRule(output: string, name: string): boolean {
  return new RegExp(String.raw`(?:^|[,{}])\.${name}(?=[{:])`).test(output);
}

test("emitsOwnRule rejects a compound class or descendant selector as proof of a utility's own rule", () => {
  expect(emitsOwnRule(".input-group.soft{--_fill-cap:12%}", "input-group"), "compound class").toBe(false);
  expect(emitsOwnRule(".input-group .child{color:red}", "input-group"), "descendant selector").toBe(false);
  expect(emitsOwnRule(".a,.input-group{color:red}", "input-group"), "comma-separated own rule").toBe(true);
  expect(emitsOwnRule(".input-group:focus-within{outline:none}", "input-group"), "pseudo-class").toBe(true);
  expect(
    emitsOwnRule("@media(forced-colors:active){.input-group{color:red}}", "input-group"),
    "first rule inside an enclosing block",
  ).toBe(true);
});

test("composition utilities emit their own rule body, not just a mention inside a selector list", async () => {
  const outputs = await Promise.all(
    ["dist/index.css", "dist/components.css", "dist/native.css"].map(async (target) => ({
      output: await readFile(path.resolve(packageRoot, target), "utf8"),
      target,
    })),
  );
  const problems = outputs.flatMap(({ output, target }) =>
    COMPOSITION_UTILITIES.filter((name) => !emitsOwnRule(output, name)).map(
      (name) => `${target} has no standalone rule for .${name}`,
    ),
  );

  expect(problems).toEqual([]);
});

/* These five are core Tailwind utility names that also appear as literal words
   in `src/`'s own declarations and comments -- `transform:` and `transition:`
   as real CSS properties, `backdrop-filter` named in `surface.css`'s own
   prose, "a container" and "a filter" used as ordinary English throughout.
   The self-scan that makes the composition utilities above possible reads
   that same text, so each one looks like a candidate. Verified against
   Tailwind 4.3.2 that none of them compile into a real rule; this holds that
   verification so a future scanner change does not ship a silent regression. */
const COLLISION_PRONE_UTILITIES = ["filter", "backdrop-filter", "transition", "transform", "container"];

test("utility names that collide with the package's own prose do not leak into the compiled output", async () => {
  const outputs = await Promise.all(
    ["dist/index.css", "dist/components.css", "dist/native.css"].map(async (target) => ({
      output: await readFile(path.resolve(packageRoot, target), "utf8"),
      target,
    })),
  );
  const leaks = outputs.flatMap(({ output, target }) =>
    COLLISION_PRONE_UTILITIES.filter((name) => emitsOwnRule(output, name)).map(
      (name) => `${target} emits a stray .${name} rule`,
    ),
  );

  expect(leaks).toEqual([]);
});

test("aggregate exports emit each public rule expansion once", async () => {
  const aggregateOutputs = await Promise.all(
    aggregateExportTargets.map(async (target) => ({
      output: await readFile(path.resolve(packageRoot, target), "utf8"),
      target,
    })),
  );

  for (const { output, target } of aggregateOutputs) {
    for (const rule of representativePublicRules) {
      expect(output.split(rule).length - 1, `${target} should emit ${rule} once`).toBe(1);
    }
  }
});

/* Compiles the given package exports the way a Tailwind consumer does: their
   own `@import "tailwindcss"` first, then each export in order. */
const compileAsConsumer = async (exportNames: readonly string[], candidates?: string) => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "codenhub-styles-export-"));
  const inputPath = path.join(temporaryRoot, "input.css");
  const outputPath = path.join(temporaryRoot, "output.css");
  const imports = exportNames.map((exportName) => {
    const entry = manifest.exports[exportName];
    const target = typeof entry === "string" ? entry : (entry?.style ?? entry?.import ?? entry?.default);
    expect(typeof target, `${exportName} must resolve to one CSS target`).toBe("string");

    return `@import "${pathToFileURL(path.resolve(packageRoot, target as string)).href}";
`;
  });
  const candidateSource = candidates
    ? `@source inline("${candidates}");
`
    : "";

  try {
    await writeFile(
      inputPath,
      `@import "${tailwindCssUrl}";
${imports.join("")}${candidateSource}`,
    );
    await executeFile(process.execPath, [tailwindCliPath, "-i", inputPath, "-o", outputPath, "--minify"], {
      cwd: packageRoot,
    });

    return await readFile(outputPath, "utf8");
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
};

/* Every `--color-*` a stylesheet reads that it never declares. Tailwind marks
   each `@theme` value a `@reference`d file reaches as reference-only, the last
   write winning, and drops those from the output. A shared file that imported
   the theme, or referenced Tailwind after it, silently undeclared the colour
   tokens -- or just the palette ramp they are built from -- on the entries that
   pulled it in. See the note in `surface.css`. */
const undeclaredColors = (css: string) => {
  const declared = new Set(css.match(/--color-[a-z0-9-]+(?=\s*:)/g) ?? []);

  return [...new Set([...css.matchAll(/var\((--color-[a-z0-9-]+)/g)].map((match) => match[1]!))].filter(
    (name) => !declared.has(name),
  );
};

/* The loader and the aesthetics carry no theme by contract; everything else
   does. */
const carriesTheme = (exportName: string) => exportName !== "./tw/loader" && !exportName.startsWith("./tw/aesthetics");

for (const [exportName, contract] of Object.entries(tailwindExportContracts)) {
  test(`${exportName} emits its representative public surface`, async () => {
    const output = await compileAsConsumer([exportName], contract.candidates);

    for (const pattern of contract.patterns) {
      expect(output, `${exportName} should emit ${pattern}`).toMatch(pattern);
    }
  });
}

for (const exportName of Object.keys(tailwindExportContracts).filter(carriesTheme)) {
  test(`${exportName} declares every colour it reads`, async () => {
    const output = await compileAsConsumer([exportName], tailwindExportContracts[exportName]?.candidates);

    expect(undeclaredColors(output)).toEqual([]);
  });
}

test("compiled entrypoints declare every colour they read", async () => {
  for (const target of ["dist/index.css", "dist/theme.css", "dist/components.css", "dist/native.css"]) {
    // oxlint-disable-next-line no-await-in-loop -- one file at a time keeps the failure naming its file.
    const output = await readFile(path.resolve(packageRoot, target), "utf8");

    expect(undeclaredColors(output), `${target} should declare every colour it reads`).toEqual([]);
  }
});

/* `/tw/button`'s documented pairing, with the loader last: a file loaded after
   the theme that referenced Tailwind used to undeclare the palette ramp. */
test("a focused entry keeps its colours when the loader loads after it", async () => {
  const output = await compileAsConsumer(["./tw/button", "./tw/loader"], "btn loader");

  expect(undeclaredColors(output)).toEqual([]);
});

/* Tailwind's content detection scans the whole package directory, and the
   compiled entrypoints narrow it back to `src/` with `@source not`. A miss in
   that list leaks: a `--color-<family>-<shade>` that appears only in a docs
   example -- the violet ramp in `docs/usage/theming.md`'s custom-intent block --
   compiles into a real `@theme` entry in the shipped CSS. This holds every
   palette color the build declares to one the stylesheet source actually
   references (comments included, because Tailwind scans those too). */
test("compiled entrypoints ship only palette colors the source references", async () => {
  const sourceDirectory = path.resolve(packageRoot, "src");
  const sourceFiles = (await readdir(sourceDirectory, { recursive: true })).filter(
    (entry): entry is string => typeof entry === "string" && entry.endsWith(".css"),
  );
  const sourceText = (
    await Promise.all(sourceFiles.map((file) => readFile(path.join(sourceDirectory, file), "utf8")))
  ).join("\n");
  const referenced = new Set(sourceText.match(/--color-[a-z]+-\d+/g) ?? []);

  const outputs = await Promise.all(
    ["dist/index.css", "dist/native.css", "dist/components.css", "dist/theme.css"].map(async (target) => ({
      target,
      output: await readFile(path.resolve(packageRoot, target), "utf8"),
    })),
  );
  const leaks = outputs.flatMap(({ target, output }) =>
    [...new Set(output.match(/--color-[a-z]+-\d+(?=\s*:)/g) ?? [])]
      .filter((declared) => !referenced.has(declared))
      .map((declared) => `${target} declares ${declared}, which src/ never references`),
  );

  expect(leaks).toEqual([]);
});
