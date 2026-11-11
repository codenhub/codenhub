import { existsSync, readFileSync } from "node:fs";
// A namespace, because `glob` is missing from Node.js releases older than the one this command supports, and a named import of a missing export fails before the version check below can say so.
import * as fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export interface CliIo {
  cwd: string;
  /** The running Node.js version, as `process.versions.node` gives it. */
  nodeVersion: string;
  /** Resolves a module specifier from this package, as `require.resolve` does. */
  resolvePackage(specifier: string): string;
  stdout(line: string): void;
  stderr(line: string): void;
}

const BIN = "codenhub-styles";
const MIN_NODE_MAJOR = 24;
/* Optional peer dependencies: a consumer who never runs this command installs
   neither. `tailwindcss` is checked too, because `tw/` imports it and
   `@tailwindcss/cli` brings a copy only some package managers let `tw/` see. */
const TAILWIND_PACKAGES = ["@tailwindcss/cli", "tailwindcss"];
const TW_AESTHETIC_EXPORT = /^\.\/tw\/aesthetics\/([^/]+)$/;

const USAGE = `Usage: ${BIN} build --content <glob> [--content <glob> ...] --output <file> [options]

Builds a StyleKit stylesheet holding only the classes your templates use.

Options:
  -c, --content <glob>   Files to scan for class names, relative to the current
                         directory. Repeat for more globs. Quote each glob.
  -o, --output <file>    Stylesheet to write. Parent directories are created.
  --aesthetic <name>     Add an aesthetic: ${"{names}"}. Repeatable.
  --no-minify            Write readable CSS instead of minified CSS.
  --help                 Show this help.
  --version              Show the version.`;

interface Manifest {
  version: string;
  exports: Record<string, unknown>;
}

interface BuildOptions {
  contentGlobs: string[];
  output: string;
  aesthetics: string[];
  shouldMinify: boolean;
}

interface SourceEntry {
  base: string;
  pattern: string;
  negated: boolean;
}

/* The parts of `@tailwindcss/node` and `@tailwindcss/oxide` this command
   calls, the same in every release this package supports (`>=4.3.2 <5`). */
interface Tailwind {
  compile(
    css: string,
    options: { base: string; from: string; polyfills: number; onDependency(path: string): void },
  ): Promise<{ sources: SourceEntry[]; build(candidates: string[]): string }>;
  optimize(css: string, options: { minify: boolean }): { code: string };
  Scanner: new (options: { sources: SourceEntry[] }) => { scan(): string[] };
}

// `Polyfills.None`, an ambient const enum in Tailwind's declarations, so its value is written out.
const POLYFILLS_NONE = 0;

export async function run(argv: readonly string[], io: CliIo): Promise<number> {
  try {
    const parsed = parseCommandLine(argv);

    if (parsed === "help") {
      io.stdout(USAGE.replace("{names}", readAestheticNames().join(", ")));
    } else if (parsed === "version") {
      io.stdout(readManifest().version);
    } else {
      const output = await build(parsed, io);
      const { size } = await fs.stat(output);

      io.stdout(`${output} ${size} bytes`);
    }

    return 0;
  } catch (error) {
    io.stderr(`${BIN}: ${error instanceof Error ? error.message : String(error)}`);

    return 1;
  }
}

function parseCommandLine(argv: readonly string[]): BuildOptions | "help" | "version" {
  const { values, positionals } = parseFlags(argv);

  if (values.help) {
    return "help";
  }
  if (values.version) {
    return "version";
  }

  const [command, ...extra] = positionals;

  if (command === undefined) {
    throw new Error(`missing command; run "${BIN} build --content <glob> --output <file>".`);
  }
  if (command !== "build") {
    throw new Error(`unknown command "${command}"; the only command is "build".`);
  }
  if (extra.length > 0) {
    throw new Error(
      `unexpected argument "${extra[0]}"; quote each --content glob so the shell does not expand it, as in --content "app/views/**/*.erb".`,
    );
  }
  if (!values.content?.length) {
    throw new Error(`missing --content; name the templates to scan, as in --content "app/views/**/*.erb".`);
  }

  const output = values.output?.trim();

  if (!output) {
    throw new Error("missing --output; name the stylesheet to write, as in --output public/app.css.");
  }

  return {
    contentGlobs: values.content,
    output,
    aesthetics: [...new Set(values.aesthetic ?? [])],
    shouldMinify: !values["no-minify"],
  };
}

function parseFlags(argv: readonly string[]) {
  try {
    return parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        content: { type: "string", short: "c", multiple: true },
        output: { type: "string", short: "o" },
        aesthetic: { type: "string", multiple: true },
        "no-minify": { type: "boolean" },
        help: { type: "boolean" },
        version: { type: "boolean" },
      },
    });
  } catch (error) {
    // parseArgs words its errors for programmers ("To specify a positional argument starting with a '-'..."), so keep only the part naming the flag.
    const flag = error instanceof Error ? /'([^']+)'/.exec(error.message)?.[1] : undefined;

    if (flag === undefined) {
      throw error;
    }

    const code = (error as { code?: string }).code;

    throw new Error(
      code === "ERR_PARSE_ARGS_UNKNOWN_OPTION"
        ? `unknown option "${flag}"; run "${BIN} --help" for the options.`
        : `option "${/--[\w-]+/.exec(flag)?.[0] ?? flag}" is missing its value or does not take one; run "${BIN} --help" for the options.`,
    );
  }
}

async function build(options: BuildOptions, io: CliIo): Promise<string> {
  assertNodeVersion(io.nodeVersion);

  const tailwind = loadTailwind(io);

  const validAesthetics = readAestheticNames();
  const unknown = options.aesthetics.find((name) => !validAesthetics.includes(name));

  if (unknown !== undefined) {
    throw new Error(`unknown aesthetic "${unknown}"; choose from ${validAesthetics.join(", ")}.`);
  }

  await Promise.all(options.contentGlobs.map((pattern) => assertMatches(pattern, io.cwd)));

  const output = path.resolve(io.cwd, options.output);
  const input = [
    `@import ${cssString(resolveExport("./tw"))};`,
    ...options.aesthetics.map((name) => `@import ${cssString(resolveExport(`./tw/aesthetics/${name}`))};`),
    ...options.contentGlobs.map((pattern) => `@source ${cssString(toCssPath(path.resolve(io.cwd, pattern)))};`),
  ].join("\n");

  try {
    const css = await compileStylesheet(tailwind, input, io.cwd, options.shouldMinify);

    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, css);
  } catch (error) {
    throw new Error(
      `Tailwind failed to build the stylesheet: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return output;
}

async function assertMatches(pattern: string, cwd: string): Promise<void> {
  for await (const entry of fs.glob(pattern, { cwd, withFileTypes: true })) {
    if (entry.isFile()) {
      return;
    }
  }

  throw new Error(`--content "${pattern}" matches no file in ${cwd}; check the path, or run from the project root.`);
}

/* Compiled as Tailwind's CLI compiles, with one difference: Tailwind's
   polyfills are off. The CLI writes a fallback for browsers without
   `color-mix()` or `@property` and has no flag to stop it, and every browser
   StyleKit supports has both, so the fallbacks were bytes that never apply,
   about a tenth of a typical build gzipped. Only the `@source` globs are
   scanned: there is no automatic source detection, so nothing of the
   consumer's other files, or of the generated input, adds a class. */
async function compileStylesheet(
  tailwind: Tailwind,
  input: string,
  cwd: string,
  shouldMinify: boolean,
): Promise<string> {
  const compiler = await tailwind.compile(input, {
    base: cwd,
    from: path.join(cwd, "codenhub-styles.css"),
    polyfills: POLYFILLS_NONE,
    onDependency() {},
  });
  const scanner = new tailwind.Scanner({ sources: compiler.sources });
  const css = compiler.build(scanner.scan());

  return shouldMinify ? tailwind.optimize(css, { minify: true }).code : css;
}

// Read from this package's own manifest, so the list follows its `exports` instead of drifting from them.
function readAestheticNames(): string[] {
  const { exports } = readManifest();

  return Object.keys(exports)
    .map((subpath) => TW_AESTHETIC_EXPORT.exec(subpath)?.[1])
    .filter((name) => name !== undefined)
    .sort();
}

/** Returns the nearest folder at or above `from` that holds a `package.json`. */
export function findPackageRoot(from: string): string {
  for (let dir = from; ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, "package.json"))) {
      return dir;
    }
    if (path.dirname(dir) === dir) {
      throw new Error(`cannot find the package.json of @codenhub/styles above ${from}.`);
    }
  }
}

// This file runs as `src/cli/run.ts` in tests and bundled as `dist/cli.js` when installed, so the package root is found from it rather than by package name.
const packageRoot = findPackageRoot(path.dirname(fileURLToPath(import.meta.url)));

function readManifest(): Manifest {
  return JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8")) as Manifest;
}

// The file a subpath export names under the `import` condition, as a `file:` URL; every StyleKit export names the same file under `style`.
function resolveExport(subpath: string): string {
  const target = (readManifest().exports[subpath] as { import: string }).import;

  return pathToFileURL(path.resolve(packageRoot, target)).href;
}

function assertNodeVersion(nodeVersion: string): void {
  if (Number.parseInt(nodeVersion, 10) < MIN_NODE_MAJOR) {
    throw new Error(`this command needs Node.js ${MIN_NODE_MAJOR} or newer; this is Node.js ${nodeVersion}.`);
  }
}

/** Loads Tailwind's compiler from where `@tailwindcss/cli` is installed, after checking both Tailwind packages are. */
function loadTailwind(io: CliIo): Tailwind {
  const manifests = TAILWIND_PACKAGES.map((name) => resolveManifest(name, io));
  const missing = TAILWIND_PACKAGES.filter((_, index) => manifests[index] === undefined);

  if (missing.length > 0) {
    throw new Error(
      `this command needs ${missing.join(" and ")}, which ${missing.length > 1 ? "are" : "is"} not installed. Run: npm install --save-dev ${missing.join(" ")}`,
    );
  }

  // `@tailwindcss/cli` depends on both at its own exact version, so they resolve from it under every package manager's layout.
  const requireFromCli = createRequire(manifests[0] as string);
  const { compile, optimize } = requireFromCli("@tailwindcss/node") as Pick<Tailwind, "compile" | "optimize">;
  const { Scanner } = requireFromCli("@tailwindcss/oxide") as Pick<Tailwind, "Scanner">;

  return { compile, optimize, Scanner };
}

// Only a package that cannot be found is absent; any other failure to resolve is passed on as it is.
function resolveManifest(name: string, io: CliIo): string | undefined {
  try {
    return io.resolvePackage(`${name}/package.json`);
  } catch (error) {
    if ((error as { code?: string }).code === "MODULE_NOT_FOUND") {
      return undefined;
    }

    throw error;
  }
}

// CSS strings treat a backslash as an escape, so a Windows path is written with forward slashes, which Tailwind accepts there too.
function toCssPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function cssString(value: string): string {
  return `"${value.replace(/["\\]/g, "\\$&")}"`;
}
