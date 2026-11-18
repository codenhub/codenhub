import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import postcss, { type AtRule } from "postcss";
import ts from "typescript";
import { expect, test } from "vitest";

interface PackageManifest {
  exports: Record<string, string | Record<string, string>>;
  bin?: Record<string, string>;
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
/* A Tailwind source export is the compiled one with `/tw` added: `./tw` for
   the root, `./button/tw` for a subpath. */
const isTailwindExport = (subpath: string) => subpath === "./tw" || subpath.endsWith("/tw");
const exportTargets = Object.entries(manifest.exports).flatMap(([subpath, target]) =>
  typeof target === "string"
    ? [{ subpath, exportName: subpath, target }]
    : Object.entries(target).map(([condition, conditionTarget]) => ({
        subpath,
        exportName: `${subpath} (${condition})`,
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
  "./theme/tw": {
    candidates: "dark:hidden",
    patterns: [
      /--color-primary:/,
      /\.dark\\:hidden:where\(\.dark,\.dark \*,\.theme-dark,\.theme-dark \*,\[data-theme=dark\],\[data-theme=dark\] \*\)/,
      /@media \(prefers-color-scheme:dark\)\{\.dark\\:hidden:not\(:where\(\.light,\.light \*,\.theme-light,\.theme-light \*,\[data-theme=light\],\[data-theme=light\] \*\)\)/,
    ],
  },
  "./components/tw": {
    candidates: "alert btn alert-icon",
    patterns: [/\.alert\{[^}]*--_capped:/, /\.btn\{[^}]*--_capped:/, /\.alert-icon\{/],
  },
  "./surface/tw": {
    candidates: "panel",
    patterns: [/\.panel\{[^}]*--_capped:/, /backdrop-filter:var\(--_layers-clear,var\(--ui-backdrop,none\)\)/],
  },
  "./button/tw": {
    candidates: "btn",
    patterns: [/\.btn\{[^}]*--_capped:/, /\.btn\{[^}]*background-color:var\(--_bg\)/],
  },
  "./form/tw": {
    candidates: "ipt radio",
    patterns: [/\.ipt\{[^}]*--_capped:/, /\.radio\{[^}]*--_capped:/, /background-color:var\(--_bg\)/],
  },
  "./feedback/tw": {
    candidates: "alert badge progress",
    patterns: [/\.alert\{[^}]*--_capped:/, /\.badge\{[^}]*--_capped:/, /\.progress\{/],
  },
  "./tooltip/tw": {
    candidates: "tooltip tooltip-bubble tooltip-icon",
    patterns: [
      /\.tooltip\{/,
      /\.tooltip-bubble\{[^}]*--_capped:/,
      /\.tooltip-icon\{[^}]*--_capped:/,
      /background-color:var\(--_bg\)/,
    ],
  },
  "./reset/tw": { candidates: "text-body", patterns: [/:focus-visible\{/] },
  "./native/tw": { candidates: "btn", patterns: [/h1\{/, /button,/] },
  "./typography/tw": { candidates: "text-title", patterns: [/\.text-title\{/] },
  "./utilities/tw": {
    candidates: "stack data-table",
    patterns: [/\.stack\{/, /\.data-table\{/, /--_capped:/, /background-color:var\(--_bg\)/],
  },
  "./aesthetics/tw": {
    patterns: [/\.neobrutalism\{/, /\.glass\{/, /\.pixel\{/, /\.chunky-tile\{/, /\.cyber\{/, /\.sketch\{/],
  },
  "./aesthetics/neobrutalism/tw": { patterns: [/\.neobrutalism\{/, /--ui-shadow-x:/, /--ui-ink:/] },
  "./aesthetics/glass/tw": { patterns: [/\.glass\{/, /--ui-backdrop:/, /--glass-radius,/] },
  /* The bar is a shade of the element rather than a repeat of it, which takes the
     opaque depth colour as well as the ink amount. Both are asserted because
     either one alone leaves the bar invisible. */
  "./aesthetics/chunky-tile/tw": {
    patterns: [/\.chunky-tile\{/, /--tile-radius,/, /--elevation-color:/, /--ui-shadow-ink:/, /--ui-active-transform:/],
  },
  /* The bevel is a corner shape rather than a clip, and it has to fall back to a
     square where an engine cannot draw it; both halves are asserted. */
  "./aesthetics/cyber/tw": {
    patterns: [/\.cyber\{/, /--cyber-cut,/, /--ui-corner-shape:\s*bevel/, /@supports not \(corner-shape:\s*bevel\)/],
  },
  "./aesthetics/sketch/tw": {
    patterns: [
      /\.sketch\{/,
      /--sketch-radius,/,
      /--sketch-radius-surface,/,
      /--ui-radius:/,
      /--ui-radius-tight:/,
      /--ui-line-style:\s*var\(--_sketch-pass-line-style,\s*var\(--_sketch-pointed\) dashed\)/,
      /--font-sketch,/,
    ],
  },
  /* The aesthetic publishes the silhouette and the inset edge as material
     tokens; the declarations that consume them belong to `box` and `surface`. */
  "./aesthetics/pixel/tw": {
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
      /\.text-title\{/,
      /\.tooltip\{/,
      /\.tooltip-bubble\{/,
      /--_capped:/,
    ],
  },
  "./native": { target: "dist/native.css", patterns: [/button,/, /h1\{/, /\.btn\{/] },
  "./aesthetics": {
    target: "dist/aesthetics/index.css",
    patterns: [/\.neobrutalism\{/, /\.glass\{/, /\.pixel\{/, /\.chunky-tile\{/, /\.cyber\{/, /\.sketch\{/],
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
  "./aesthetics/sketch": {
    target: "dist/aesthetics/sketch.css",
    patterns: [
      /\.sketch\{/,
      /--sketch-radius,/,
      /--sketch-radius-surface,/,
      /--ui-radius:/,
      /--ui-radius-tight:11px 1px 7px 2px \/ 2px 7px 1px 11px/,
      /--ui-line-style:solid/,
      /--ui-rule-style:var\(--_sketch-pass-rule-style,var\(--_sketch-pointed\) dashed\)/,
      /--font-sketch,/,
    ],
  },
};
const aggregateExportTargets = ["dist/components.css", "dist/index.css"];
const representativePublicRules = [".box{--_fill-cap:100%;--_cap-lift:0%;--_d-fill:0%;"];

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

/* What npm would publish, which `files` decides, as the publish workflow packs
   it. An export target that exists after a build but sits outside `files`
   ships as a broken path, and the command's bundle and the purge sources are
   no export at all, so they are named too. Run through a shell on Windows,
   where npm is a `.cmd` script. */
test(
  "the package npm would publish holds every export target, the command, and its sources",
  { timeout: 60_000 },
  async () => {
    const { stdout } = await executeFile("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
      cwd: packageRoot,
      shell: process.platform === "win32",
    });
    const [packed] = JSON.parse(stdout) as [{ files: { path: string }[] }];
    const files = new Set(packed.files.map((file) => file.path));
    const expected = [
      ...new Set(exportTargets.map(({ target }) => target.replace(/^\.\//, ""))),
      ...Object.values(manifest.bin ?? {}).map((target) => target.replace(/^\.\//, "")),
      "dist/purge/index.css",
      "dist/purge/classes.json",
      "package.json",
      "NOTICE",
    ];

    expect(expected).toContain("dist/cli.js");
    expect(expected.filter((file) => !files.has(file))).toEqual([]);
  },
);

/* Every CSS file under one of the package's published directories, as
   package-relative paths with forward slashes. */
const shippedStylesheets = async (directory: string) =>
  (await readdir(path.resolve(packageRoot, directory), { recursive: true }))
    .filter((file) => file.endsWith(".css"))
    .map((file) => `${directory}/${file.replaceAll("\\", "/")}`);

/* An HTML `<style>` element ends at the first `</style`, whatever CSS token it
   sits in, so a stylesheet inlined into a page would drop every rule after one.
   Every CSS file under `dist/` and `tw/` ships -- the compiled entries and the
   `/tw` sources alike -- so every one is checked, not just the export targets. */
test("no shipped stylesheet contains a sequence that ends an inline style element", async () => {
  const stylesheets = [...(await shippedStylesheets("dist")), ...(await shippedStylesheets("tw"))];
  const outputs = await Promise.all(stylesheets.map((file) => readFile(path.resolve(packageRoot, file), "utf8")));
  const unsafe = stylesheets.filter((_, index) => /<\/style/i.test(outputs[index]!));

  expect(stylesheets.length).toBeGreaterThan(0);
  expect(unsafe).toEqual([]);
});

/* The checkbox's check and dash are drawn from Lucide's `check` and `minus`,
   under ISC, which Lucide derives from Feather, under MIT. Both licences ask
   for their notice in every copy, and a compiled stylesheet is copied on its
   own: served from a CDN, or committed into a project's assets, apart from the
   package's NOTICE. So a compiled file that carries the marks names them, and
   so does a `/tw` source, which a consumer's Tailwind copies into its build. */
test("every shipped stylesheet that carries the checkbox marks names their licence", async () => {
  const stylesheets = [...(await shippedStylesheets("dist")), ...(await shippedStylesheets("tw"))];
  const outputs = await Promise.all(stylesheets.map((file) => readFile(path.resolve(packageRoot, file), "utf8")));
  const marked = stylesheets.filter((_, index) => outputs[index]!.includes("20 6 9 17 4 12"));
  const unnoticed = marked.filter((file) => {
    const notice = /\/\*![^*]*Lucide[^*]*\*\//.exec(outputs[stylesheets.indexOf(file)]!)?.[0] ?? "";

    return !(notice.includes("ISC") && notice.includes("Feather") && notice.includes("MIT"));
  });

  expect(marked).toContain("dist/index.css");
  expect(marked).toContain("dist/purge/index.css");
  expect(marked).toContain("tw/components/form.rules.css");
  expect(unnoticed).toEqual([]);
});

/* A `--tw-*` variable is Tailwind's own, renamed or dropped in any release. The
   package's bodies carry Tailwind's expansion of the utilities they were
   written with, which reads a few, such as `--tw-leading` beside `font-size`,
   so that a consumer's `leading-*` still reaches them. Each one read is one the
   package registers and ships itself (`src/base/properties.css`), so on a
   Tailwind that renamed it the body still resolves: to its fallback, or to the
   registration's initial value. */
test("every variable private to Tailwind that /tw reads, /tw registers", async () => {
  const theme = await readFile(path.resolve(packageRoot, "tw/theme.css"), "utf8");
  const registered = new Set([...theme.matchAll(/@property\s+(--tw-[\w-]+)/g)].map(([, name]) => name));
  const unregistered: string[] = [];

  for (const file of await shippedStylesheets("tw")) {
    // oxlint-disable-next-line no-await-in-loop -- few files, read in turn.
    const css = await readFile(path.resolve(packageRoot, file), "utf8");

    unregistered.push(
      ...[...css.matchAll(/var\(\s*(--tw-[\w-]+)/g)]
        .filter(([, name]) => !registered.has(name!))
        .map(([, name]) => `${file}: ${name}`),
    );
  }

  expect(registered.size).toBe(9);
  expect(unregistered).toEqual([]);
});

/* `files` publishes all of `tw/`, so a source no `/tw` export imports ships as
   bytes nobody can load: `tw/palette.css`, a copy of the generated palette,
   reached consumers only through `dist/palette.css`. */
test("every stylesheet under tw/ is reachable from a /tw export", async () => {
  const targets = Object.entries(manifest.exports)
    .filter(([exportName]) => isTailwindExport(exportName))
    .map(([, target]) => (typeof target === "string" ? target : target.default).replace(/^\.\//, ""));
  const reached = new Set<string>();
  const queue = [...targets];

  while (queue.length > 0) {
    const file = queue.pop()!;

    if (reached.has(file)) {
      continue;
    }

    reached.add(file);

    // oxlint-disable-next-line no-await-in-loop -- a walk: each file names the next ones to read.
    const css = await readFile(path.resolve(packageRoot, file), "utf8");

    for (const [, specifier] of css.matchAll(/@(?:import|reference)\s+"(\.[^"]+)"/g)) {
      queue.push(path.posix.join(path.posix.dirname(file), specifier!));
    }
  }

  const unreachable = (await shippedStylesheets("tw")).filter((file) => !reached.has(file));

  expect(targets.length).toBeGreaterThan(0);
  expect(unreachable).toEqual([]);
});

/* `tw/` is a copy of `src/`, and the build command's TypeScript lives in
   `src/cli/`: copied whole, it shipped as source no export reaches. */
test("tw/ holds stylesheets and their declaration file, nothing else", async () => {
  const entries = await readdir(path.resolve(packageRoot, "tw"), { recursive: true, withFileTypes: true });
  const strays = entries
    .map((entry) => ({
      entry,
      relative: path.relative(path.resolve(packageRoot, "tw"), path.join(entry.parentPath, entry.name)),
    }))
    .filter(({ entry, relative }) => entry.isFile() && !entry.name.endsWith(".css") && relative !== "index.d.ts")
    .map(({ relative }) => relative);

  expect(strays).toEqual([]);
});

/* TypeScript 6 checks side-effect imports by default
   (`noUncheckedSideEffectImports`), and `declare module "*.css"` cannot match
   `@codenhub/styles` or `/aesthetics/glass`, which have no extension. Without
   a `types` condition, `import "@codenhub/styles";` was TS2882 under
   `moduleResolution: bundler`. This compiles such imports with the workspace
   TypeScript. The consumer is an in-memory file inside the package, so each
   specifier resolves by package self-reference, through `exports` exactly as
   it would from `node_modules`. */
test("side-effect imports typecheck with noUncheckedSideEffectImports", () => {
  const specifiers = [
    "@codenhub/styles",
    "@codenhub/styles/theme",
    "@codenhub/styles/components",
    "@codenhub/styles/aesthetics/glass",
    "@codenhub/styles/native",
    "@codenhub/styles/tw",
    "@codenhub/styles/button/tw",
    "@codenhub/styles/aesthetics/glass/tw",
  ];

  const options: ts.CompilerOptions = {
    module: ts.ModuleKind.Preserve,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    noUncheckedSideEffectImports: true,
    strict: true,
    target: ts.ScriptTarget.ESNext,
    types: [],
  };
  const entry = path.join(packageRoot, "side-effect-imports.ts").replaceAll("\\", "/");
  const source = specifiers.map((specifier) => `import "${specifier}";\n`).join("");
  const host = ts.createCompilerHost(options);
  const { fileExists, getSourceFile, readFile: readHostFile } = host;
  const isEntry = (fileName: string) => fileName.replaceAll("\\", "/") === entry;

  host.fileExists = (fileName) => isEntry(fileName) || fileExists.call(host, fileName);
  host.readFile = (fileName) => (isEntry(fileName) ? source : readHostFile.call(host, fileName));
  host.getSourceFile = (fileName, languageVersion, ...rest) =>
    isEntry(fileName)
      ? ts.createSourceFile(fileName, source, languageVersion)
      : getSourceFile.call(host, fileName, languageVersion, ...rest);

  const program = ts.createProgram([entry], options, host);
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .map((diagnostic) => `TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`);

  expect(program.getRootFileNames()).toEqual([entry]);
  expect(diagnostics).toEqual([]);
});

/* The test above samples entrypoints; this holds every one. TypeScript takes
   the first condition it recognises, so `types` has to lead, and it has to
   name a declaration rather than the stylesheet. */
test("every stylesheet export leads with a types condition naming a declaration", () => {
  const missing = Object.entries(manifest.exports)
    .filter(([exportName]) => exportName !== "./package.json")
    .filter(([, target]) => {
      const [first, ...rest] = typeof target === "string" ? [] : Object.entries(target);

      return !first || first[0] !== "types" || !first[1].endsWith(".d.ts") || rest.length === 0;
    })
    .map(([exportName]) => exportName);

  expect(missing).toEqual([]);
});

/* `dist/` holds finished CSS only, so a server that serves or fingerprints it
   as static files never meets a directive it cannot resolve. With the `/tw`
   source inside it, Django's `ManifestStaticFilesStorage` failed
   `collectstatic` on `dist/tw/components/index.css`'s bare
   `@import "tailwindcss/utilities.css"`. The Tailwind source ships in `tw/`. */
test("dist holds only finished CSS, with no Tailwind or import directive left", async () => {
  const stylesheets = await shippedStylesheets("dist");
  const outputs = await Promise.all(stylesheets.map((file) => readFile(path.resolve(packageRoot, file), "utf8")));
  const unfinished = stylesheets.flatMap((file, index) =>
    [
      ...stripComments(outputs[index]!).matchAll(/@(import|apply|utility|theme|source|reference|custom-variant)\b/g),
    ].map((match) => `${file} contains @${match[1]}`),
  );

  expect(stylesheets.length).toBeGreaterThan(0);
  expect([...new Set(unfinished)]).toEqual([]);
});

test("every /tw export resolves into tw/, outside dist, and nothing else does", () => {
  const misplaced = exportTargets
    .filter(({ subpath, target }) => isTailwindExport(subpath) !== target.startsWith("./tw/"))
    .map(({ exportName, target }) => `${exportName} -> ${target}`);

  expect(misplaced).toEqual([]);
});

/* The rule a consumer is told: the Tailwind source of an entry is its path with
   `/tw` added. `./palette` has none: it is generated values, with nothing for
   Tailwind to compile. */
test("every compiled export has its Tailwind source at the same path with /tw added", () => {
  const subpaths = Object.keys(manifest.exports);
  const missing = subpaths
    .filter((subpath) => !isTailwindExport(subpath) && subpath !== "./package.json" && subpath !== "./palette")
    .map((subpath) => (subpath === "." ? "./tw" : `${subpath}/tw`))
    .filter((subpath) => !subpaths.includes(subpath));

  expect(missing).toEqual([]);
});

for (const [exportName, contract] of Object.entries(compiledExportContracts)) {
  test(`${exportName} compiled export contains its representative public surface`, async () => {
    const output = await readFile(path.resolve(packageRoot, contract.target), "utf8");

    for (const pattern of contract.patterns) {
      expect(output, `${exportName} should contain ${pattern}`).toMatch(pattern);
    }
  });
}

/* Cascade layers (docs/internal/model.md#cascade-layers). A browser orders layers by
   the first time it meets each name, so every compiled entrypoint has to name
   the package's four in Tailwind's order before it uses one -- a sheet that
   opened `components` first would rank it below `theme` and `base` when loaded
   on its own. `properties` is Tailwind's `@property` fallback layer and sits
   wherever Tailwind puts it. */
const LAYER_ORDER = ["theme", "base", "components", "utilities"];

function firstLayerOrder(source: string): string[] {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const names: string[] = [];
  /* The layer each open block sits in, so a nested `@layer families` is named
     as the browser names it -- `utilities.families`, or `base.families` where
     `/native` applies a component in `base` -- and a top-level `families` is
     not mistaken for a sublayer. */
  const stack: string[] = [];
  let buffer = "";
  let quote: string | null = null;
  const enclosing = () => stack.findLast((entry) => entry !== "") ?? "";
  const qualify = (name: string) => (enclosing() ? `${enclosing()}.${name}` : name);

  for (let index = 0; index < css.length; index++) {
    const character = css[index]!;

    if (quote) {
      if (character === quote && css[index - 1] !== "\\") {
        quote = null;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "{" || character === ";") {
      const layer = /^@layer\s+([a-z][a-z0-9.,\s-]*)$/.exec(buffer.trim());
      const declared = layer ? layer[1]!.split(",").map((name) => qualify(name.trim())) : [];

      names.push(...declared);
      if (character === "{") {
        stack.push(declared.length === 1 ? declared[0]! : "");
      }
      buffer = "";
    } else if (character === "}") {
      stack.pop();
      buffer = "";
    } else {
      buffer += character;
    }
  }

  /* Only the top-level order is the package's: a sublayer such as
     `utilities.families` ranks inside its parent wherever it is first met. */
  return [...new Set(names)].filter((name) => name !== "properties" && !name.includes("."));
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
   `forced-colors` accessibility override, the closed and
   open `<dialog>` restatements that must beat `.card`'s own `display`, and the
   solo classes, which must beat a foreign component's unlayered CSS. Keyframe
   steps are not style rules at all. Anything else unlayered beats a consumer's
   utility, which is the thing the layer map exists to stop. */
const UNLAYERED_ALLOWED: { reason: string; matches: (rule: { context: string; selector: string }) => boolean }[] = [
  { reason: "keyframe step", matches: (rule) => rule.context.startsWith("@keyframes") },
  { reason: "forced-colors override", matches: (rule) => rule.context.includes("forced-colors:active") },
  {
    reason: "dialog restatement on the package's containers",
    matches: (rule) => /^dialog:is\(\.card,\.panel,\.surface\)(?::not\(\[open\]\)|\[open\])$/.test(rule.selector),
  },
  {
    reason: "closed-popover restatement on the package's surfaces",
    matches: (rule) => rule.selector === ":is(.card,.panel,.surface,.alert)[popover]:not(:popover-open)",
  },
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

/* The contracts above spot-check a handful of classes per entrypoint. The
   build places every utility in an entrypoint's import closure except those its
   entry in `scripts/lib/entries.mjs` omits, so a utility an omit list drops by
   mistake ships absent from its bundle with nothing failing. This holds every
   utility a compiled entrypoint's own source tree defines against its output.

   A utility is a rule directly in `@layer utilities` whose selector is one
   class. `roots` is the entrypoint's import closure, not just its directory:
   the `dist/components.css` index pulls `../box.css` and
   `../typography.rules.css` alongside `./`, and a utility added to either
   belongs in that bundle. */
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

  const names = new Set<string>();

  for (const source of perRoot.flat()) {
    postcss.parse(source).walkRules((rule) => {
      const parent = rule.parent;

      if (
        parent?.type === "atrule" &&
        (parent as AtRule).name === "layer" &&
        (parent as AtRule).params === "utilities" &&
        /^\.[a-z][a-z0-9-]*$/.test(rule.selector)
      ) {
        names.add(rule.selector.slice(1));
      }
    });
  }

  return [...names];
}

const compiledCompleteness: Record<string, string[]> = {
  "dist/index.css": ["src"],
  "dist/components.css": ["src/components", "src/box.css", "src/typography.rules.css", "src/theme.css"],
  "dist/native.css": ["src"],
  "dist/theme.css": ["src/intent.css", "src/presentation.css", "src/elevation.css", "src/corner.css", "src/size.css"],
};

for (const [target, roots] of Object.entries(compiledCompleteness)) {
  test(`${target} emits every utility its source tree defines`, async () => {
    const output = await readFile(path.resolve(packageRoot, target), "utf8");
    const defined = await definedUtilities(roots);
    const missing = defined.filter((name) => !new RegExp(String.raw`\.${name}(?![\w-])`).test(output));

    expect(defined.length, `${target}'s source defines utilities`).toBeGreaterThan(0);

    expect(missing, `${target} is missing rules for: ${missing.join(", ")}`).toEqual([]);
  });
}

/* The check above only asks whether a utility's name appears anywhere in the
   output, which a class inside an `:is()`/`:where()` argument list already
   satisfies -- `.input-group).soft{` passes it without `input-group`'s own
   body ever being placed. That gap is how `.input-group`, `.text-control`, and
   `.surface` once went dark while every assertion here still passed, and only
   the browser suite caught it. The six composition utilities are the ones at
   risk -- other rules name them inside selector lists far more often than any
   component class -- so this holds each to emitting a real rule. */
const COMPOSITION_UTILITIES = ["box", "box-hover", "box-active", "text-control", "surface", "input-group"];

/* True when `name` starts a rule of its own in `output`: immediately followed
   by `{` (its base declarations) or `:` (a pseudo-class state, the only form
   `box-hover` and `box-active` ever compile as -- `.box-hover:not(...):hover{`,
   never a bare `.box-hover{`). A comma, a compound-class `.`, a bracket, a
   space, or a combinator after the name does not qualify: `.input-group.soft{`
   is a modifier rule that only fires alongside `input-group`'s own body, and
   `.input-group .child{` styles a descendant, neither of which proves
   `input-group`'s own rule was placed. The name may be preceded by
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
   The compiled build once compiled with Tailwind scanning that text, where each
   one looked like a candidate. It scans nothing now, and a `/tw` consumer's
   Tailwind skips `node_modules`; this keeps either from changing silently. */
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

/* The list above only names the collisions someone already found. Any word in
   a scanned file that happens to be a Tailwind utility compiles too -- the
   license's "contents" once shipped `.contents{display:contents}` -- so this
   holds every class the compiled entrypoints emit to one the stylesheet source
   names itself as a selector.
   Classes are read from selector preludes only, on both sides, so class-like
   text in a declaration value, a comment, or a string names nothing. */

/* Comments out, strings kept: a `/*` inside a string such as
   `@source not "../*.md"` opens no comment. */
function stripComments(css: string): string {
  let output = "";
  let quote: string | null = null;

  for (let index = 0; index < css.length; index++) {
    const character = css[index]!;

    if (quote) {
      if (character === quote && css[index - 1] !== "\\") {
        quote = null;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "/" && css[index + 1] === "*") {
      const end = css.indexOf("*/", index + 2);

      index = end === -1 ? css.length : end + 1;
      continue;
    }
    output += character;
  }

  return output;
}

/* The prelude of every style rule, nested ones included: the text before a
   `{` that does not start an at-rule. A declaration ends at `;` or `}` and is
   dropped, and quoted strings are skipped so a brace in one opens nothing. */
function selectorPreludes(source: string): string[] {
  const css = stripComments(source);
  const preludes: string[] = [];
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

      if (!head.startsWith("@")) {
        preludes.push(head);
      }
      buffer = "";
    } else if (character === "}" || character === ";") {
      buffer = "";
    } else {
      buffer += character;
    }
  }

  return preludes;
}

const classNamesIn = (css: string) =>
  new Set(
    selectorPreludes(css).flatMap((prelude) =>
      [...prelude.matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)].map((match) => match[1]!),
    ),
  );

test("classNamesIn reads selectors, not declaration values", () => {
  const names = classNamesIn(
    '@source not "../*.md";.a,.b:is(.c){content:".d";font-family:x.e}/* .k{ */.f{&.g{--h:.i}}@media (min-width:1px){.j{color:red}}',
  );

  expect([...names].sort()).toEqual(["a", "b", "c", "f", "g", "j"]);
});

test("compiled entrypoints emit only classes the stylesheet source names", async () => {
  const sourceDirectory = path.resolve(packageRoot, "src");
  const sourceFiles = (await readdir(sourceDirectory, { recursive: true })).filter(
    (entry): entry is string => typeof entry === "string" && entry.endsWith(".css"),
  );
  const sourceText = stripComments(
    (await Promise.all(sourceFiles.map((file) => readFile(path.join(sourceDirectory, file), "utf8")))).join("\n"),
  );
  const named = classNamesIn(sourceText);

  const outputs = await Promise.all(
    ["dist/index.css", "dist/components.css", "dist/native.css", "dist/theme.css"].map(async (target) => ({
      output: await readFile(path.resolve(packageRoot, target), "utf8"),
      target,
    })),
  );
  const leaks = outputs.flatMap(({ output, target }) =>
    [...classNamesIn(output)]
      .filter((name) => !named.has(name))
      .map((name) => `${target} emits .${name}, which src/ never names`),
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

/* Every declaration of a minified stylesheet, each with the chain of rule
   preludes it sits in: `@layer utilities > .btn > &:hover > color:red`. */
const declarationsIn = (css: string): string[] => {
  const declarations: string[] = [];
  const preludes: string[] = [];
  let token = "";
  let quote = "";
  let parentheses = 0;

  const flush = () => {
    if (token.trim() !== "") {
      declarations.push([...preludes, token.trim()].join(" > "));
    }
    token = "";
  };

  for (const character of css) {
    if (quote !== "") {
      quote = character === quote ? "" : quote;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "(") {
      parentheses += 1;
    } else if (character === ")") {
      parentheses -= 1;
    } else if (parentheses === 0 && character === "{") {
      preludes.push(token.trim());
      token = "";
      continue;
    } else if (parentheses === 0 && (character === ";" || character === "}")) {
      flush();
      if (character === "}") {
        preludes.pop();
      }
      continue;
    }
    token += character;
  }

  return declarations;
};

/* Tailwind stacks a `@utility` that reaches one build more than once: each
   registration appends its body, so `@apply box` expands to as many copies as
   there are files that `@reference` `box.css`. Nine did, and 63% of the
   declarations in `dist/index.css` were repeats of one already in the same
   rule. A repeat changes nothing a browser computes, so nothing else failed.

   The one repeat is Tailwind's: Preflight's link rule comes out of its
   minifier with the prefixed declaration twice. */
const RESTATED_DECLARATIONS = ["@layer base > a > -webkit-text-decoration:inherit"];

test("aggregate exports state each declaration once", async () => {
  for (const target of [...aggregateExportTargets, "dist/native.css"]) {
    const seen = new Set<string>();
    const repeated = new Set<string>();

    // oxlint-disable-next-line no-await-in-loop -- one file at a time keeps the failure naming its file.
    const output = await readFile(path.resolve(packageRoot, target), "utf8");

    for (const declaration of declarationsIn(output)) {
      (seen.has(declaration) ? repeated : seen).add(declaration);
    }

    for (const restated of RESTATED_DECLARATIONS) {
      repeated.delete(restated);
    }

    expect([...repeated].slice(0, 5), `${target} repeats ${repeated.size} of ${seen.size} declarations`).toEqual([]);
  }
});

/* Compiles the given package exports the way a Tailwind consumer does, as the
   Tailwind guide tells them to: their own `@import "tailwindcss"` first, then
   each export in order -- except with `./tw`, which imports Tailwind itself
   and replaces that line. */
const compileAsConsumer = async (exportNames: readonly string[], candidates?: string, { minify = true } = {}) => {
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

  const tailwindImport = exportNames.includes("./tw")
    ? ""
    : `@import "${tailwindCssUrl}";
`;

  try {
    await writeFile(inputPath, `${tailwindImport}${imports.join("")}${candidateSource}`);
    await executeFile(
      process.execPath,
      [tailwindCliPath, "-i", inputPath, "-o", outputPath, ...(minify ? ["--minify"] : [])],
      {
        cwd: packageRoot,
      },
    );

    return await readFile(outputPath, "utf8");
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
};

/* `./tw` is the one source entry that imports Tailwind, so the guide has a
   consumer import it alone. Preflight's border reset is the marker: two copies
   means Tailwind was imported twice. Unminified, because the minifier merges
   the duplicate rules and hides it, which a consumer's development build does
   not. */
test("./tw brings Tailwind's Preflight exactly once", async () => {
  const output = await compileAsConsumer(["./tw"], "btn", { minify: false });

  expect(output.match(/::file-selector-button \{\s*box-sizing: border-box;/g) ?? []).toHaveLength(1);
});

/* `/tw` shares one Tailwind build with the consumer's own utilities, so a
   breakpoint it redefined moved every `2xl:` class in their app. It adds `xs`
   and leaves Tailwind's own steps alone. */
test("./tw adds an xs breakpoint and keeps Tailwind's 2xl", async () => {
  const output = await compileAsConsumer(["./tw"], "xs:flex 2xl:flex");

  expect(output).toMatch(/@media \(min-width:30rem\)\{\.xs\\:flex\{display:flex\}\}/);
  expect(output).toMatch(/@media \(min-width:96rem\)\{\.\\32 xl\\:flex\{display:flex\}\}/);
});

/* The compiled entries once safelisted every class with `@source inline(...)`,
   since they had no markup to scan. Left in the `/tw` copy, the same lists made
   a consumer's build emit every class whatever their pages used -- byte for
   byte the compiled `dist/index.css`. The copy keeps none. */
test("the /tw source safelists nothing", async () => {
  const stylesheets = await shippedStylesheets("tw");
  const outputs = await Promise.all(stylesheets.map((file) => readFile(path.resolve(packageRoot, file), "utf8")));

  expect(stylesheets.length).toBeGreaterThan(0);
  expect(stylesheets.filter((_, index) => /@source\s+inline\(/.test(stripComments(outputs[index]!)))).toEqual([]);
});

/* `compileAsConsumer` runs in the package root, where Tailwind's automatic
   detection scans this package's own `src/` and would find every class. A
   tree-shaking check needs a consumer that owns nothing but its page. */
const compileIsolatedConsumer = async (css: string, html: string) => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "codenhub-styles-consumer-"));

  try {
    await writeFile(path.join(temporaryRoot, "page.html"), html);
    await writeFile(path.join(temporaryRoot, "input.css"), css);
    await executeFile(process.execPath, [tailwindCliPath, "-i", "input.css", "-o", "output.css", "--minify"], {
      cwd: temporaryRoot,
    });

    return await readFile(path.join(temporaryRoot, "output.css"), "utf8");
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
};

test("./tw emits only the components a consumer's pages use", async () => {
  const twEntry = pathToFileURL(path.resolve(packageRoot, "tw/index.css")).href;
  const output = await compileIsolatedConsumer(
    `@import "${twEntry}";\n`,
    '<button class="btn primary">Save</button>\n',
  );
  const compiled = await readFile(path.resolve(packageRoot, "dist/index.css"), "utf8");

  expect(output).toMatch(/\.btn\{[^}]*--_capped:/);
  expect(output).toMatch(/\.primary\{/);
  /* A rule that starts with the class. `emitsOwnRule` would also count a
     plain rule that only lists it, such as the reset's forced-colors
     `.btn,…,.badge{border-color:CanvasText}`, which ships whatever is used. */
  for (const unused of ["alert", "badge", "data-table", "tooltip-bubble", "stack", "card"]) {
    expect(output, `.${unused} is unused and should not be emitted`).not.toMatch(
      new RegExp(String.raw`(?:^|[{}])\.${unused}(?![\w-])`),
    );
  }
  expect(output.length).toBeLessThan(compiled.length / 4);
});

/* The axis and modifier classes are utilities, so Tailwind's variants reach
   them: a button that turns soft on hover, or large from a breakpoint. As plain
   classes each of these compiled to nothing, with no error. */
test("./tw gives the axis and modifier classes Tailwind's variants", async () => {
  const twEntry = pathToFileURL(path.resolve(packageRoot, "tw/index.css")).href;
  const output = await compileIsolatedConsumer(
    `@import "${twEntry}";\n`,
    '<button class="btn hover:soft md:lg focus:primary dark:edged md:raised">Save</button>\n',
  );

  expect(output).toMatch(/\.hover\\:soft:hover\{[^}]*--ui-fill:12%/);
  expect(output).toMatch(/\.md\\:lg\{[^}]*--_size-lg:/);
  expect(output).toMatch(/\.focus\\:primary:focus\{[^}]*--intent-color:var\(--color-primary\)/);
  expect(output).toMatch(/\.dark\\:edged[^{]*\{[^}]*--ui-border:100%/);
  expect(output).toMatch(/\.md\\:raised\{[^}]*--ui-elevation:1/);
});

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

/* The aesthetics carry no theme by contract; everything else does. */
const carriesTheme = (exportName: string) => !exportName.startsWith("./aesthetics/");

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

/* Tailwind drops a `@theme` value that nothing in the entry reads, so a token
   the docs promise can be missing from an entry whose own rules never use it --
   `/theme` has no reset or components to read `--color-background`. The colour
   check above sees only what an entry reads; this one holds every compiled
   entry carrying the theme to the tokens `docs/usage/theming.md` publishes. */
const UNDECLARED_DOCUMENTED_TOKENS = new Set([
  // Computed on the focused element, never declared -- see `theme.css`.
  "--focus-ring",
  "--focus-ring-offset",
  // A Tailwind breakpoint: it exists only in a `/tw` consumer's build.
  "--breakpoint-xs",
]);

/* Each table with a floor under its row count, a few rows below today's, so a
   renamed heading or a row format the pattern stops matching fails here rather
   than shrinking what the test checks. */
const DOCUMENTED_TOKEN_TABLES = { "## Color tokens": 40, "## Foundation tokens": 25 };

const documentedThemeTokens = async () => {
  const theming = await readFile(path.resolve(packageRoot, "docs/usage/theming.md"), "utf8");

  return Object.entries(DOCUMENTED_TOKEN_TABLES).map(([heading, floor]) => {
    const start = theming.indexOf(heading);
    const end = theming.indexOf("\n## ", start + heading.length);
    const section = start === -1 ? "" : theming.slice(start, end === -1 ? undefined : end);

    return { heading, floor, tokens: [...section.matchAll(/^\| `(--[a-z0-9-]+)`/gm)].map((match) => match[1]!) };
  });
};

test("compiled entrypoints declare every documented colour and foundation token", async () => {
  const tables = await documentedThemeTokens();

  for (const { heading, floor, tokens } of tables) {
    expect(tokens.length, `${heading} should list at least ${floor} tokens`).toBeGreaterThanOrEqual(floor);
  }

  const tokens = [...new Set(tables.flatMap((table) => table.tokens))].filter(
    (token) => !UNDECLARED_DOCUMENTED_TOKENS.has(token),
  );

  for (const target of ["dist/index.css", "dist/theme.css", "dist/components.css", "dist/native.css"]) {
    // oxlint-disable-next-line no-await-in-loop -- one file at a time keeps the failure naming its file.
    const output = await readFile(path.resolve(packageRoot, target), "utf8");
    const declared = new Set(output.match(/--[a-z0-9-]+(?=\s*:)/g) ?? []);

    expect(
      tokens.filter((token) => !declared.has(token)),
      `${target} should declare every documented token`,
    ).toEqual([]);
  }
});

/* The compiled build keeps the theme values its output reads. When Tailwind
   compiled it, its content detection scanned the whole package directory, and a
   `--color-<family>-<shade>` that appeared only in a docs example compiled into
   the shipped theme. No color ramp a documentation example names may reach the
   compiled theme: this holds every palette color the build declares to one the
   stylesheet source actually references, comments included. */
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
