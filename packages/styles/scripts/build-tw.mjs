/**
 * Generates `tw/`, the source a `/tw` consumer's Tailwind compiles: `src/`
 * written in Tailwind's terms, so their build emits only the classes their
 * markup uses, with their own theme and variants.
 *
 * - Each utility, a lone class in `@layer utilities`, becomes `@utility name`,
 *   which Tailwind emits only where a page names it and which `@apply` and
 *   variants reach. Its body is the one the compiled build writes, `@compose`
 *   already copied in, so the consumer's Tailwind needs nothing of this
 *   package's own.
 * - `src/base/` is Tailwind's own, so its imports point back at `tailwindcss`.
 * - `tokens.css` becomes `@theme static`, so a consumer's utilities read the
 *   tokens (`bg-primary`) and every token ships, as each is public.
 * - `tw/theme.css`, which every `/tw` export imports, carries what only the
 *   adapter needs: `base/properties.css`, the `--tw-*` registrations a utility
 *   body sets by hand and Tailwind therefore does not register, after the
 *   theme's imports; and `adapter.css`, the breakpoint and the `dark` variant,
 *   which mean something only to Tailwind, at its end.
 * - An export that composes a utility its own imports do not bring references
 *   the file that defines it, so a consumer of that export alone can name the
 *   utility or `@apply` it. An aggregate references nothing: each route to a
 *   file that defines a utility appends its body once more.
 *
 * `tw/` sits beside `dist/` rather than inside it, so `dist/` holds finished
 * CSS only: a server that serves or fingerprints `dist/` as static files, such
 * as Django's `ManifestStaticFilesStorage`, never meets a bare
 * `@import "tailwindcss/..."` it cannot resolve.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import postcss from "postcss";

import { createCompiler } from "./lib/compile.mjs";
import { withNotice } from "./notice.mjs";

const packageRoot = path.resolve(fileURLToPath(import.meta.url), "../..");
const source = path.join(packageRoot, "src");
const target = path.join(packageRoot, "tw");

/* Sources no `/tw` export imports: `files` publishes all of `tw/`, so copied
   they would ship as bytes nobody can load. The palette reaches consumers as
   `dist/palette.css`, and the build command in `cli/` as `dist/cli.js`.
   `base/`, `adapter.css`, and `tokens.css` reach `tw/` rewritten, below. */
const NOT_COPIED = new Set(["palette.css", "theme.compiled.css", "adapter.css", "tokens.css"]);
const NOT_COPIED_DIRECTORIES = ["cli", "base"];

const TAILWIND_IMPORTS = {
  "base/index.css": "tailwindcss",
  "base/theme.css": "tailwindcss/theme.css",
  "base/utilities.css": "tailwindcss/utilities.css",
};

/* The `src/` files the `/tw` exports name, relative to it. */
const EXPORTS = new Set(
  Object.values(JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8")).exports)
    .map((conditions) => conditions.style)
    .filter((style) => style?.startsWith("./tw/"))
    .map((style) => style.slice("./tw/".length)),
);

const compiler = createCompiler(source);

/* `writeFileSync` overwrites but never deletes, so a source file that was
   renamed or removed would linger in `tw/` and ship -- `files` publishes all
   of it. */
rmSync(target, { recursive: true, force: true });

for (const entry of readdirSync(source, { recursive: true })) {
  const relative = String(entry).replaceAll("\\", "/");

  if (
    !relative.endsWith(".css") ||
    NOT_COPIED.has(relative) ||
    NOT_COPIED_DIRECTORIES.some((directory) => relative.startsWith(`${directory}/`))
  ) {
    continue;
  }

  const file = path.join(source, relative);
  const root = postcss.parse(readFileSync(file, "utf8"), { from: file });

  if (EXPORTS.has(relative)) {
    referenceComposed(root, file);
  }

  pointAtTailwind(root, relative);
  writeUtilities(root, relative);
  compiler.expand(root);

  if (relative === "theme.css") {
    placeRegistrations(root);
  }

  let css = root.toString();

  if (relative === "theme.css") {
    css += `\n${readFileSync(path.join(source, "adapter.css"), "utf8")}`;
  }

  write(relative, css);
}

write("tokens.css", themeStatic(path.join(source, "tokens.css")));

/* The `/tw` exports' `types` condition, for the same reason as `dist/index.d.ts`
   in `build-styles.mjs`. */
writeFileSync(path.join(target, "index.d.ts"), "export {};\n");

/* A focused export composes utilities it does not import: `/button/tw` copies
   `box` into `.btn` but brings no `box.css`. It references the files that
   define them, so the consumer's Tailwind registers those utilities and their
   markup and `@apply` can name `box` as with every other export. An aggregate
   imports them; referencing them as well would register each twice, and
   Tailwind appends a body per registration. */
function referenceComposed(root, file) {
  const imported = closure(file);
  const defining = new Set();
  const pending = [...imported].flatMap((member) => composedNames(postcss.parse(readFileSync(member, "utf8"))));
  const seen = new Set();

  while (pending.length > 0) {
    const name = pending.pop();

    if (seen.has(name)) {
      continue;
    }

    seen.add(name);
    const definition = compiler.utility(name);
    defining.add(definition.source.input.file);
    pending.push(...composedNames(definition));
  }

  const first = root.nodes.find((node) => node.type === "atrule" && node.name === "import");

  for (const definition of [...defining].filter((member) => !imported.has(member)).sort()) {
    const specifier = path.relative(path.dirname(file), definition).replaceAll("\\", "/");

    first.before(
      postcss.atRule({ name: "reference", params: `"${specifier.startsWith(".") ? specifier : `./${specifier}`}"` }),
    );
    first.prev().raws.before = first.raws.before;
    first.raws.before = "\n";
  }

  root.first.raws.before = "";
}

function closure(file, files = new Set()) {
  if (files.has(file) || file.startsWith(path.join(source, "base") + path.sep)) {
    return files;
  }

  files.add(file);

  postcss.parse(readFileSync(file, "utf8")).walkAtRules("import", (rule) => {
    closure(path.resolve(path.dirname(file), rule.params.match(/^(["'])(.+?)\1/)[2]), files);
  });

  return files;
}

function composedNames(node) {
  const names = [];

  node.walkAtRules("compose", (rule) => names.push(...rule.params.trim().split(/\s+/)));

  return names;
}

/* The registrations open the theme's own rules rather than close the file: an
   entry that imports the theme twice, as `/reset` does through `/typography`,
   keeps only the first copy of each, and Lightning CSS merges the two copies
   of the theme's closing `forced-colors` block only when nothing stands between
   them. */
function placeRegistrations(root) {
  const imports = root.nodes.filter((node) => node.type === "atrule" && node.name === "import");
  const registrations = postcss.parse(readFileSync(path.join(source, "base/properties.css"), "utf8"));

  const [opening] = registrations.nodes;

  imports.at(-1).after(registrations.nodes);
  opening.raws.before = "\n\n";
}

function pointAtTailwind(root, relative) {
  root.walkAtRules("import", (rule) => {
    const match = rule.params.match(/^(["'])(.+?)\1(.*)$/);
    const imported = path.posix.normalize(path.posix.join(path.posix.dirname(relative), match[2]));
    const replacement = TAILWIND_IMPORTS[imported];

    if (replacement) {
      rule.params = `"${replacement}"${match[3]}`;
    }
  });
}

/* A run of utilities sits in `@layer utilities` of its own in `src/`; in `tw/`
   each is a top-level `@utility`, where Tailwind requires it. */
function writeUtilities(root, relative) {
  root.walkRules((rule) => {
    if (!compiler.isUtility(rule)) {
      return;
    }

    const layer = rule.parent;

    if (
      layer.parent.type !== "root" ||
      layer.nodes.some((node) => node.type !== "comment" && !compiler.isUtility(node))
    ) {
      throw new Error(`${relative}: the @layer utilities holding .${rule.selector.slice(1)} holds other rules too`);
    }
  });

  for (const layer of root.nodes.filter((node) => node.nodes?.some((child) => compiler.isUtility(child)))) {
    const nodes = layer.nodes.map((node) => {
      const top =
        node.type === "comment"
          ? node
          : postcss.atRule({ name: "utility", params: node.selector.slice(1), nodes: node.nodes });

      if (top.type === "atrule") {
        compiler.expand(top);
        reindent(top, 0);
        top.raws.between = " ";
      }

      dedent(top, 0);
      top.raws.before = /\n[ \t]*\n/.test(node.raws.before ?? "") ? "\n\n" : "\n";

      return top;
    });

    nodes[0].raws.before = layer.raws.before;
    layer.replaceWith(nodes);
  }
}

/* The body moves up one level, and a composed body arrives from its own file
   at its own depth, so each node takes the indentation of where it now sits. */
function reindent(node, depth) {
  const indent = "  ".repeat(depth + 1);

  for (const child of node.nodes) {
    dedent(child, depth + 1);
    child.raws.before = (/\n[ \t]*\n/.test(child.raws.before ?? "") ? "\n\n" : "\n") + indent;

    if (child.nodes) {
      reindent(child, depth + 1);
      child.raws.between = child.type === "rule" ? " " : child.raws.between;
    }
  }

  node.raws.after = `\n${"  ".repeat(depth)}`;
  node.raws.semicolon = true;
}

/* A comment's later lines are indented for the column it started at. */
function dedent(node, depth) {
  if (node.type !== "comment" || !node.source?.start) {
    return;
  }

  const was = `\n${" ".repeat(node.source.start.column - 1)}`;

  node.text = node.text.replaceAll(was, `\n${"  ".repeat(depth)}`);
}

function themeStatic(file) {
  const root = postcss.parse(readFileSync(file, "utf8"), { from: file });
  const header = root.nodes.filter((node) => node.type === "comment");
  let tokens;

  root.walkRules(/^:root,\s*:host$/, (rule) => {
    tokens = rule;
  });

  const theme = postcss.atRule({ name: "theme", params: "static", nodes: tokens.nodes });

  theme.cleanRaws(true);

  return `${header.map(String).join("\n")}\n${theme.toString()}\n`;
}

function write(relative, css) {
  const file = path.join(target, relative);

  mkdirSync(path.dirname(file), { recursive: true });
  /* A `/tw` source that carries the checkbox marks is a copy of them too, and
     a consumer's Tailwind keeps its `/*!` comment in the stylesheet it builds. */
  writeFileSync(file, withNotice(css));
}
