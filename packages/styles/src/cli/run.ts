import { realpathSync } from "node:fs";
import * as fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { findFiles, readFiles, UnmatchedEntryError } from "@codenhub/scan";

import {
  createTemporary,
  findClasses,
  format,
  HEAD_BYTES,
  isPackageCopy,
  MIN_NODE_MAJOR,
  parse,
  purge,
  PURGE_SOURCE,
  readAestheticNames,
  readDroppable,
  readManifest,
  readPackageFile,
  readShippedSizes,
  replaceFile,
  resolveExport,
  serialize,
  systemReason,
  usedClasses,
  WRITTEN_HEAD,
} from "../trim";

export interface CliIo {
  cwd: string;
  /** The running Node.js version, as `process.versions.node` gives it. */
  nodeVersion: string;
  stdout(line: string): void;
  stderr(line: string): void;
}

const BIN = "chs";
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
  const { values, positionals, tokens } = parseFlags(argv);

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
  // A quoted variable left empty, as in `-c "$TEMPLATES"`, named the working directory, and the advice for a folder named the root of the disk.
  if (!values.content?.length || values.content.some((entry) => entry.trim() === "")) {
    throw new Error(`missing --content; name the templates to scan, as in --content "app/views/**/*.erb".`);
  }

  // parseArgs keeps the last value of a flag given twice, so `-o a.css -o b.css` wrote b.css alone.
  if (tokens.filter((token) => token.kind === "option" && token.name === "output").length > 1) {
    throw new Error("--output is given more than once; name one stylesheet to write.");
  }

  const output = values.output?.trim();

  if (!output) {
    throw new Error("missing --output; name the stylesheet to write, as in --output public/app.css.");
  }
  if (output === "-") {
    throw new Error(
      "--output - would write a file named -; this command writes no standard output, so name a stylesheet, as in --output public/app.css.",
    );
  }

  return {
    contentGlobs: values.content,
    output,
    aesthetics: [...new Set(values.aesthetic ?? [])],
    shouldMinify: !values["no-minify"],
  };
}

const OPTIONS = {
  content: { type: "string", short: "c", multiple: true },
  output: { type: "string", short: "o" },
  aesthetic: { type: "string", multiple: true },
  "no-minify": { type: "boolean" },
  help: { type: "boolean" },
  version: { type: "boolean" },
} as const;

/* One of this command's own options, as `-o`, `--output`, or `--output=a.css`:
   after an option that takes a value, it is a value left out, not one that
   starts with a dash. */
function isOwnOption(arg: string): boolean {
  return Object.entries(OPTIONS).some(
    ([name, option]) =>
      arg === `--${name}` || arg.startsWith(`--${name}=`) || ("short" in option && arg === `-${option.short}`),
  );
}

function parseFlags(argv: readonly string[]) {
  try {
    return parseArgs({
      args: [...argv],
      allowPositionals: true,
      tokens: true,
      options: OPTIONS,
    });
  } catch (error) {
    // parseArgs words its errors for programmers ("To specify a positional argument starting with a '-'..."), so keep only the part naming the flag.
    const flag = error instanceof Error ? /'([^']+)'/.exec(error.message)?.[1] : undefined;

    if (flag === undefined) {
      throw error;
    }

    const code = (error as { code?: string }).code;
    // As in "To specify an option argument starting with a dash use '--output=-XYZ' or '-o-XYZ'."
    const name = (error as Error).message.includes("starting with a dash")
      ? /'(--[\w-]+)=-XYZ'/.exec((error as Error).message)?.[1]
      : undefined;

    if (name !== undefined) {
      const at = argv.findIndex((arg, index) => arg === flag && argv[index + 1]?.startsWith("-"));
      const value = at === -1 ? "<value>" : argv[at + 1];

      if (value !== undefined && isOwnOption(value)) {
        throw new Error(`option "${name}" is missing its value; run "${BIN} --help" for the options.`);
      }
      throw new Error(
        `option "${name}" is missing its value; to give it a value that starts with a dash, write ${name}=${value}.`,
      );
    }

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

  const output = path.resolve(io.cwd, options.output);

  await assertReplaceable(options, io.cwd, output);

  /* The output's folder as the system resolves it, as each content file is, so
     a glob that reaches the output by another spelling, such as a Windows 8.3
     short name, still leaves it out. The output itself is not followed: a link
     there is replaced, as other build tools replace one. */
  const resolved = path.join(await realPathOf(path.dirname(output)), path.basename(output));
  const contents = readContent(options.contentGlobs, io.cwd, resolved, options.output);

  const droppable = await readDroppable();
  const shipped = await readShippedSizes();
  const found = new Set<string>();

  // One file at a time, so a broad glob holds only the file being read and the classes found so far.
  for (const content of contents) {
    // oxlint-disable-next-line no-await-in-loop -- one file at a time, as the loop reads them
    if (await isPackageCopy(content, droppable, shipped)) {
      continue;
    }
    for (const name of findClasses(content, droppable)) {
      found.add(name);
    }
  }
  const used = usedClasses(found, droppable);

  const write = options.shouldMinify ? serialize : format;
  const stylesheets = await Promise.all(
    [PURGE_SOURCE, ...options.aesthetics.map((name) => resolveExport(`./aesthetics/${name}`))].map(readPackageFile),
  );
  const css = stylesheets.map((stylesheet) => write(purge(parse(stylesheet), used))).join("");

  /* Written beside the output and renamed over it, so a write that fails
     partway, on a full disk say, leaves the previous stylesheet whole rather
     than a truncated one a deploy would ship. */
  let temporary: string | undefined;

  try {
    await fs.mkdir(path.dirname(output), { recursive: true });

    const created = await createTemporary(output);

    temporary = created.path;
    try {
      await created.handle.writeFile(css);
      await keepModeOf(created.handle, output);
    } finally {
      await created.handle.close();
    }
    await replaceFile(temporary, output);
  } catch (error) {
    // Best effort, and only for a file this build created: the error worth reporting is the one above.
    if (temporary !== undefined) {
      await fs.rm(temporary, { force: true }).catch(() => undefined);
    }
    throw new Error(`cannot write --output ${options.output}: ${describeWriteError(error)}`);
  }

  return output;
}

/* The stylesheet is renamed over the output, so it would come out with the mode
   of a new file: a `0640` file would come back `0644`, readable by everyone.
   The temporary file takes the permission bits of the file it replaces first.
   Windows keeps none: its mode is only the read-only attribute, which a rename
   over the file refuses. */
async function keepModeOf(handle: fs.FileHandle, target: string): Promise<void> {
  if (process.platform === "win32") {
    return;
  }

  const previous = await fs.stat(target).catch((error: unknown) => {
    if ((error as { code?: string }).code === "ENOENT") {
      return undefined;
    }
    throw error;
  });

  if (previous !== undefined) {
    await handle.chmod(previous.mode & 0o777);
  }
}

/* Node.js names the path a system call failed on, and here that is mostly the
   temporary file, a name the user never gave and cannot find afterwards. The
   message keeps Node.js's reason and code, drops the paths, and says what to do. */
function describeWriteError(error: unknown): string {
  const system = systemReason(error);

  if (system === undefined) {
    return error instanceof Error ? error.message : String(error);
  }

  const { reason, code } = system;
  let advice = "fix that, or name another file";

  if (["EACCES", "EPERM", "EROFS"].includes(code)) {
    advice = "check that you can write to it and to its folder, or name another file";
  } else if (["ENOSPC", "EDQUOT"].includes(code)) {
    advice = "free some space, or name a file on another disk";
  }

  return `${reason} (${code}); ${advice}.`;
}

/* The output is replaced whole, so a file this command did not write is
   refused rather than lost: a template named as the output by mistake, as in
   `--content index.html --output index.html`, or a stylesheet written by hand.
   What it writes starts with the package's head, after Tailwind's banner, so
   a file that does is replaced; another banner or a layer order does not tell
   a stylesheet written by hand from a built one. A file of no bytes, or of
   whitespace alone, holds nothing to lose and is replaced too. What is not a
   file, after any link, is refused: renaming over a pipe, or as root over a
   device such as `/dev/null`, would replace it with the stylesheet. A file that
   cannot be read is refused: a directory can let a file be renamed over that it
   does not let be read. */
async function assertReplaceable(options: BuildOptions, cwd: string, output: string): Promise<void> {
  if (options.contentGlobs.some((entry) => path.relative(path.resolve(cwd, entry), output) === "")) {
    throw new Error(`--output ${options.output} is also a --content file; name a stylesheet to write.`);
  }

  let head: string;
  let size: number;

  try {
    const stats = await fs.stat(output);

    if (!stats.isFile()) {
      throw new NotAFileError(
        `--output ${options.output} is ${kindOf(stats)}, not a file; name a stylesheet to write.`,
      );
    }
    if (stats.size === 0) {
      return;
    }
    size = stats.size;

    const handle = await fs.open(output);

    try {
      const { buffer, bytesRead } = await handle.read(Buffer.alloc(HEAD_BYTES), 0, HEAD_BYTES, 0);

      head = buffer.toString("utf8", 0, bytesRead);
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return;
    }
    if (error instanceof NotAFileError) {
      throw error;
    }

    throw new Error(
      `cannot read --output ${options.output} to check it is a stylesheet this command wrote: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // `\s` takes a byte order mark too. A head past the bytes read is not found, and the file is refused.
  if (head.trim() === "" && Buffer.byteLength(head) === size) {
    return;
  }
  if (!WRITTEN_HEAD.test(head)) {
    throw new Error(
      `--output ${options.output} holds something this command did not write; move it or name another file.`,
    );
  }
}

class NotAFileError extends Error {}

function kindOf(stats: { isDirectory(): boolean; isFIFO(): boolean; isSocket(): boolean }): string {
  if (stats.isDirectory()) {
    return "a folder";
  }
  if (stats.isFIFO()) {
    return "a pipe";
  }

  return stats.isSocket() ? "a socket" : "a device";
}

/* Every entry has to name a file and every file has to be readable, so a build
   from missing content fails rather than writing a stylesheet without its
   classes. The output is left out: it names every class it keeps, so a glob
   that matches it would keep last build's classes, and the stylesheet would
   grow with each build instead of following the templates. An entry is checked
   once the output is left out, so one that matched only the output, as
   `public/*.css` does after a build into `public/`, fails rather than build
   from nothing. `path.relative` is empty for the same file, in the case
   Windows ignores. A wildcard stays out of `node_modules` unless the entry
   names it: a dependency's demo page, or this package's own list of every
   class, would keep classes no template uses. */
function readContent(entries: readonly string[], cwd: string, output: string, given: string): Generator<string> {
  const files = new Set<string>();

  for (const entry of entries) {
    let matched: string[];

    try {
      matched = findFiles([entry], { cwd, failOnUnmatched: true, failOnUnreadable: true, skipNodeModules: true });
    } catch (error) {
      throw error instanceof UnmatchedEntryError ? new Error(`--content ${error.message}`) : error;
    }

    const content = matched.filter((file) => path.relative(realPathSyncOf(file), output) !== "");

    if (content.length === 0) {
      throw new Error(
        `--content "${entry}" matches only --output ${given}, which is never read for classes; name the templates to scan.`,
      );
    }
    for (const file of content) {
      files.add(file);
    }
  }

  return readFiles(files, { cwd, failOnUnreadable: true });
}

function assertNodeVersion(nodeVersion: string): void {
  if (Number.parseInt(nodeVersion, 10) < MIN_NODE_MAJOR) {
    throw new Error(`this command needs Node.js ${MIN_NODE_MAJOR} or newer; this is Node.js ${nodeVersion}.`);
  }
}

/* The path as the system resolves it, or as given while nothing is there yet. */
async function realPathOf(file: string): Promise<string> {
  try {
    return await fs.realpath(file);
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") {
      throw error;
    }

    return file;
  }
}

/* The native resolver, as `fs.realpath` above uses: on Windows the JavaScript
   one keeps an 8.3 short name or a `subst` drive as written, so the output and
   a content file naming it compared unequal and the output was read back. */
function realPathSyncOf(file: string): string {
  try {
    return realpathSync.native(file);
  } catch {
    // The read that follows reports a file it cannot reach.
    return file;
  }
}
