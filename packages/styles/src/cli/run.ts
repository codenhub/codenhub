import { existsSync, readFileSync } from "node:fs";
// A namespace, because `glob` is missing from Node.js releases older than the one this command supports, and a named import of a missing export fails before the version check below can say so.
import * as fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { format, parse, purge, serialize } from "./purge";

export interface CliIo {
  cwd: string;
  /** The running Node.js version, as `process.versions.node` gives it. */
  nodeVersion: string;
  stdout(line: string): void;
  stderr(line: string): void;
}

const BIN = "chs";
const MIN_NODE_MAJOR = 24;
const AESTHETIC_EXPORT = /^\.\/aesthetics\/([^/]+)$/;
/* What `scripts/build-purge.mjs` writes: the complete stylesheet with the
   variants this command offers, and the class names it may drop from one. */
const PURGE_SOURCE = "dist/purge/index.css";
const PURGE_CLASSES = "dist/purge/classes.json";

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

  const validAesthetics = readAestheticNames();
  const unknown = options.aesthetics.find((name) => !validAesthetics.includes(name));

  if (unknown !== undefined) {
    throw new Error(`unknown aesthetic "${unknown}"; choose from ${validAesthetics.join(", ")}.`);
  }

  const files = new Set((await Promise.all(options.contentGlobs.map((pattern) => findFiles(pattern, io.cwd)))).flat());
  const contents = await Promise.all([...files].map((file) => fs.readFile(file, "utf8")));

  const droppable = new Set(JSON.parse(await readPackageFile(PURGE_CLASSES)) as string[]);
  const found = new Set(contents.flatMap((content) => findClasses(content, droppable)));
  // A class this command may not drop is one no template has to name, such as `.theme-dark`, so it always counts as used.
  const used = { has: (name: string) => found.has(name) || !droppable.has(name) };

  const stylesheets = await Promise.all(
    [PURGE_SOURCE, ...options.aesthetics.map((name) => resolveExport(`./aesthetics/${name}`))].map(readPackageFile),
  );
  const write = options.shouldMinify ? serialize : format;
  const css = stylesheets.map((stylesheet) => write(purge(parse(stylesheet), used))).join("");
  const output = path.resolve(io.cwd, options.output);

  try {
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, css);
  } catch (error) {
    throw new Error(`cannot write the stylesheet: ${error instanceof Error ? error.message : String(error)}`);
  }

  return output;
}

/** Returns the files a `--content` glob matches, as absolute paths, and fails when there are none. */
async function findFiles(pattern: string, cwd: string): Promise<string[]> {
  const files: string[] = [];

  for await (const entry of fs.glob(pattern, { cwd, withFileTypes: true })) {
    if (entry.isFile()) {
      files.push(path.resolve(entry.parentPath, entry.name));
    }
  }

  if (files.length === 0) {
    throw new Error(`--content "${pattern}" matches no file in ${cwd}; check the path, or run from the project root.`);
  }

  return files;
}

/* Content is read as text and never run, as Tailwind reads it: every run of
   characters a class name can hold is a word, and a word counts when it is a
   class this package defines. A word that is not one is read again by its
   parts around each colon, so Svelte's `class:primary={isPrimary}` and a Ruby
   `btn: true` are found. */
function findClasses(content: string, known: ReadonlySet<string>): string[] {
  return content
    .split(/[^\w:-]+/)
    .flatMap((word) => (known.has(word) ? [word] : word.split(":")))
    .filter((word) => known.has(word));
}

// Read from this package's own manifest, so the list follows its `exports` instead of drifting from them.
function readAestheticNames(): string[] {
  const { exports } = readManifest();

  return Object.keys(exports)
    .map((subpath) => AESTHETIC_EXPORT.exec(subpath)?.[1])
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

// The file a subpath export names under the `import` condition, relative to the package root; every StyleKit export names the same file under `style`.
function resolveExport(subpath: string): string {
  return (readManifest().exports[subpath] as { import: string }).import;
}

function readPackageFile(relativePath: string): Promise<string> {
  return fs.readFile(path.resolve(packageRoot, relativePath), "utf8");
}

function assertNodeVersion(nodeVersion: string): void {
  if (Number.parseInt(nodeVersion, 10) < MIN_NODE_MAJOR) {
    throw new Error(`this command needs Node.js ${MIN_NODE_MAJOR} or newer; this is Node.js ${nodeVersion}.`);
  }
}
