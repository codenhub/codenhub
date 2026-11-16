import { existsSync, readdirSync, readFileSync } from "node:fs";
import * as fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { findFiles, readFiles, UnmatchedEntryError } from "@codenhub/scan";

import { renderAttributionBanner, renderSuppressedAttributionWarning } from "../catalog/attribution.js";
import { parseIconClass, resolveIconClassName } from "../core/class-names.js";
import { IconRegistry } from "../core/registry.js";
import type { IconFamilyData } from "../core/types.js";
import { generateBaseCss, generateIconSetCss } from "../generator/css-generator.js";
import { scanIconClasses } from "../scanner/class-scanner.js";

export interface CliIo {
  cwd: string;
  /** The running Node.js version, as `process.versions.node` gives it. */
  nodeVersion: string;
  stdout(line: string): void;
  stderr(line: string): void;
}

const BIN = "chi";
const MIN_NODE_MAJOR = 26;
// What `scripts/build-data.mjs` writes: one module per family, named by its prefix.
const DATA_DIRECTORY = "dist/data";

const USAGE = `Usage: ${BIN} build --content <glob> [--content <glob> ...] --output <file> [options]

Builds a stylesheet holding only the icons your files use.

Options:
  -c, --content <glob>         Files to scan for icon classes, relative to the
                               current directory. Repeat for more globs. Quote
                               each glob.
  -o, --output <file>          Stylesheet to write. Parent directories are
                               created.
  --family <prefix>            Resolve icons from this family. Repeatable.
                               Default: every family except the brand ones.
                               Families: ${"{families}"}.
  --default-prefix <prefix>    Family a bare name, such as ic-heart, resolves
                               against.
  --prefix <prefix>            Class prefix. Default: ic.
  --stroke-width <width>       Stroke width for stroke-based families. Default:
                               each family's own.
  --no-base                    Leave out the base rules.
  --attribution <auto|off>     License notices as a comment at the top (auto),
                               or none (off). Default: auto.
  --help                       Show this help.
  --version                    Show the version.`;

type AttributionMode = "auto" | "off";

interface BuildOptions {
  contentGlobs: string[];
  output: string;
  families: string[] | undefined;
  defaultPrefix: string | undefined;
  prefix: string;
  strokeWidth: number | undefined;
  injectBase: boolean;
  attribution: AttributionMode;
}

export async function run(argv: readonly string[], io: CliIo): Promise<number> {
  try {
    const parsed = parseCommandLine(argv);

    if (parsed === "help") {
      io.stdout(USAGE.replace("{families}", readFamilyPrefixes().join(", ")));
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
      `unexpected argument "${extra[0]}"; quote each --content glob so the shell does not expand it, as in --content "src/**/*.html".`,
    );
  }
  if (!values.content?.length) {
    throw new Error(`missing --content; name the files to scan, as in --content "src/**/*.html".`);
  }

  const output = values.output?.trim();

  if (!output) {
    throw new Error("missing --output; name the stylesheet to write, as in --output public/icons.css.");
  }

  const attribution = values.attribution ?? "auto";

  if (attribution !== "auto" && attribution !== "off") {
    throw new Error(`unknown --attribution "${attribution}"; choose auto or off.`);
  }

  return {
    contentGlobs: values.content,
    output,
    families: values.family === undefined ? undefined : [...new Set(values.family)],
    defaultPrefix: values["default-prefix"],
    prefix: values.prefix ?? "ic",
    strokeWidth: values["stroke-width"] === undefined ? undefined : parseStrokeWidth(values["stroke-width"]),
    injectBase: !values["no-base"],
    attribution,
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
        family: { type: "string", multiple: true },
        "default-prefix": { type: "string" },
        prefix: { type: "string" },
        "stroke-width": { type: "string" },
        "no-base": { type: "boolean" },
        attribution: { type: "string" },
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

function parseStrokeWidth(value: string): number {
  const width = Number(value);

  if (value.trim() === "" || !Number.isFinite(width) || width <= 0) {
    throw new Error(`--stroke-width "${value}" is not a positive number, such as 1.5.`);
  }

  return width;
}

async function build(options: BuildOptions, io: CliIo): Promise<string> {
  assertNodeVersion(io.nodeVersion);

  const available = readFamilyPrefixes();
  const unknown = options.families?.find((prefix) => !available.includes(prefix));

  if (unknown !== undefined) {
    throw new Error(`unknown family "${unknown}"; choose from ${available.join(", ")}.`);
  }

  const selected = options.families ?? available;

  if (options.defaultPrefix !== undefined && !selected.includes(options.defaultPrefix)) {
    throw new Error(`unknown default prefix "${options.defaultPrefix}"; choose from ${selected.join(", ")}.`);
  }

  const output = path.resolve(io.cwd, options.output);
  const found = new Set<string>();

  for (const text of readContent(options.contentGlobs, io.cwd, output)) {
    for (const className of scanIconClasses(text, { prefix: options.prefix })) {
      found.add(className);
    }
  }

  const families = await loadFamilies(selected, found, options);
  const registry = new IconRegistry({ defaultPrefix: options.defaultPrefix });

  for (const family of families) {
    registry.registerFamily(family);
  }

  const unresolved = findUnresolved(found, registry, options.prefix);

  if (unresolved.length > 0) {
    io.stderr(
      `${BIN}: warning: ${unresolved.length === 1 ? "this class resolves" : `these ${unresolved.length} classes resolve`} to no icon: ${unresolved.join(", ")}.`,
    );
  }

  const css = renderStylesheet(found, registry, options, io);

  /* Written beside the output and renamed over it, so a write that fails
     partway, on a full disk say, leaves the previous stylesheet whole rather
     than a truncated one a deploy would ship. */
  const temporary = `${output}.${process.pid}.tmp`;

  try {
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(temporary, css);
    await fs.rename(temporary, output);
  } catch (error) {
    // Best effort: the error worth reporting is the one above.
    await fs.rm(temporary, { force: true }).catch(() => undefined);
    throw new Error(`cannot write the stylesheet: ${error instanceof Error ? error.message : String(error)}`);
  }

  return output;
}

/* Every entry has to name a file and every file has to be readable, so a build
   from missing content fails rather than writing a stylesheet without some
   icons. The previous output is never read, even when an entry matches it:
   its rules would keep every icon it ever held, and its words would be
   reported as classes that resolve to no icon. */
function readContent(entries: readonly string[], cwd: string, output: string): Generator<string> {
  let files: string[];

  try {
    files = findFiles(entries, { cwd, failOnUnmatched: true });
  } catch (error) {
    throw error instanceof UnmatchedEntryError ? new Error(`--content ${error.message}`) : error;
  }

  return readFiles(
    files.filter((file) => file !== output),
    { failOnUnreadable: true },
  );
}

/* Only the families a found class can name are loaded, with the default
   prefix's: a class resolves only through a family whose prefix starts its
   name, or through the default family, as `resolveIconClassName` reads it, so
   the result is the one every selected family would give. Without --family,
   brand families stay out, as in `/tw`, because their marks carry trademark
   terms a project should choose to take on. */
async function loadFamilies(
  selected: readonly string[],
  found: ReadonlySet<string>,
  options: BuildOptions,
): Promise<IconFamilyData[]> {
  const names = [...found].map((className) => parseIconClass(className.slice(options.prefix.length + 1)).name);
  const named = selected.filter(
    (prefix) => prefix === options.defaultPrefix || names.some((name) => name.startsWith(`${prefix}-`)),
  );
  const families = await Promise.all(named.map(loadFamily));

  if (options.families !== undefined) {
    return families;
  }

  const brand = families.find((family) => family.prefix === options.defaultPrefix && family.info.tier === "brand");

  if (brand !== undefined) {
    throw new Error(
      `default prefix "${brand.prefix}" is a brand family, which resolves only when named; add --family ${brand.prefix} with the other families you use.`,
    );
  }

  return families.filter((family) => family.info.tier !== "brand");
}

async function loadFamily(prefix: string): Promise<IconFamilyData> {
  const module = (await import(pathToFileURL(path.join(packageRoot, DATA_DIRECTORY, `${prefix}.js`)).href)) as {
    default: IconFamilyData;
  };

  return module.default;
}

/* A class the base rules own, a size or a motion utility, resolves to no icon
   by design, so it is read from the base rules themselves rather than listed
   twice. */
function findUnresolved(found: ReadonlySet<string>, registry: IconRegistry, prefix: string): string[] {
  const owned = scanIconClasses(generateBaseCss({ prefix }), { prefix });

  return [...found]
    .filter(
      (className) =>
        !owned.has(className) &&
        resolveIconClassName(registry, parseIconClass(className.slice(prefix.length + 1)).name) === undefined,
    )
    .toSorted();
}

// What the PostCSS plugin appends for the same classes and options, so either route writes the same rules.
function renderStylesheet(
  found: ReadonlySet<string>,
  registry: IconRegistry,
  options: BuildOptions,
  io: CliIo,
): string {
  if (found.size === 0 && !options.injectBase) {
    return "";
  }

  const { css, families } = generateIconSetCss(found, registry, {
    injectBase: options.injectBase,
    prefix: options.prefix,
    strokeWidth: options.strokeWidth,
  });

  if (!css) {
    return "";
  }
  if (options.attribution === "off") {
    const warning = renderSuppressedAttributionWarning(families);

    if (warning) {
      io.stderr(`${BIN}: warning: ${warning}`);
    }

    return css;
  }

  const banner = renderAttributionBanner(families);

  return banner === undefined ? css : `${banner}\n${css}`;
}

// Read from this package's own files, so the list follows the families the build wrote.
function readFamilyPrefixes(): string[] {
  return readdirSync(path.join(packageRoot, DATA_DIRECTORY))
    .filter((file) => file.endsWith(".js"))
    .map((file) => file.slice(0, -".js".length))
    .sort();
}

/** Returns the nearest folder at or above `from` that holds a `package.json`. */
export function findPackageRoot(from: string): string {
  for (let dir = from; ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, "package.json"))) {
      return dir;
    }
    if (path.dirname(dir) === dir) {
      throw new Error(`cannot find the package.json of @codenhub/icons above ${from}.`);
    }
  }
}

// This file runs as `src/cli/run.ts` in tests and bundled as `dist/cli.js` when installed, so the package root is found from it rather than by package name.
const packageRoot = findPackageRoot(path.dirname(fileURLToPath(import.meta.url)));

function readManifest(): { version: string } {
  return JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8")) as { version: string };
}

function assertNodeVersion(nodeVersion: string): void {
  if (Number.parseInt(nodeVersion, 10) < MIN_NODE_MAJOR) {
    throw new Error(`this command needs Node.js ${MIN_NODE_MAJOR} or newer; this is Node.js ${nodeVersion}.`);
  }
}
