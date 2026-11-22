import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import * as fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { findFiles, readFiles, splitWords, UnmatchedEntryError } from "@codenhub/scan";

import { classesOf, format, parse, purge, serialize } from "./purge";

export interface CliIo {
  cwd: string;
  /** The running Node.js version, as `process.versions.node` gives it. */
  nodeVersion: string;
  stdout(line: string): void;
  stderr(line: string): void;
}

const BIN = "chs";
const MIN_NODE_MAJOR = 26;
/* `./aesthetics/tw` is the Tailwind source of every aesthetic, not an aesthetic
   named `tw`, which the path therefore rules out as a name. */
const AESTHETIC_EXPORT = /^\.\/aesthetics\/(?!tw$)([^/]+)$/;
/* What `scripts/build-purge.mjs` writes: the complete stylesheet with the
   variants this command offers, and the class names it may drop from one. */
const PURGE_SOURCE = "dist/purge/index.css";
const PURGE_CLASSES = "dist/purge/classes.json";
/* How much of an existing output is read to tell whether this command wrote it. */
const HEAD_BYTES = 1024;
/* What every stylesheet this command has written starts with: the package's
   notice, after Tailwind's banner. The compiled stylesheets carry it too. */
const WRITTEN_HEAD = /^\s*(?:\/\*! tailwindcss [^*]*\*\/\s*)?\/\*! @codenhub\/styles\b/;
/* The names Windows reserves for a device in every folder, with any extension
   and in any case: `-o NUL` or `-o public/com1.css` wrote a file that `del`
   cannot remove. */
const WINDOWS_DEVICE = /^(?:con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³])\s*(?:\..*)?$/i;

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
  // `path.resolve` drops a trailing separator, so `newdir/` wrote a file named `newdir` where none existed.
  if ((process.platform === "win32" ? /[\\/]$/ : /\/$/).test(output)) {
    throw new Error(
      `--output ${output} ends with a folder separator, so it names a folder, not a file; name a stylesheet to write, as in --output ${output}app.css.`,
    );
  }
  // It resolves `newdir/.` and `newdir/sub/..` to `newdir` as well.
  const lastSegment = (process.platform === "win32" ? /(^|[\\/])(\.\.?)$/ : /(^|\/)(\.\.?)$/).exec(output);

  if (lastSegment !== null) {
    throw new Error(
      `--output ${output} ends with a . or .. segment, so it names a folder, not a file; name a stylesheet to write, as in --output ${output}${lastSegment[1] || "/"}app.css.`,
    );
  }

  // A rename onto such a name writes a real file there, past the `stat` that finds a device elsewhere.
  if (process.platform === "win32" && WINDOWS_DEVICE.test(path.win32.basename(output))) {
    throw new Error(`--output ${output} is a device, not a file; name a stylesheet to write.`);
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

  // Through a link, the file it leads to is the one written, and the one no glob may read.
  const target = await realPathOf(output);
  const contents = readContent(options.contentGlobs, io.cwd, target, options.output);

  const droppable = new Set(JSON.parse(await readPackageFile(PURGE_CLASSES)) as string[]);
  const source = parse(await readPackageFile(PURGE_SOURCE));
  const aesthetics = await readAesthetics(validAesthetics, classesOf(source));
  const known = { has: (name: string) => droppable.has(name) || aesthetics.owners.has(name) };
  const shipped = await readShippedSizes();
  const found = new Set<string>();

  // One file at a time, so a broad glob holds only the file being read and the classes found so far.
  for (const content of contents) {
    // oxlint-disable-next-line no-await-in-loop -- one file at a time, as the loop reads them
    if (await isPackageCopy(content, droppable, shipped)) {
      continue;
    }
    for (const name of findClasses(content, known)) {
      found.add(name);
    }
  }
  // A class this command may not drop is one no template has to name, such as `.theme-dark`, so it always counts as used.
  const used = { has: (name: string) => found.has(name) || !droppable.has(name) };

  const write = options.shouldMinify ? serialize : format;
  const css = [source, ...options.aesthetics.map((name) => aesthetics.trees.get(name) ?? [])]
    .map((tree) => write(purge(tree, used)))
    .join("");
  const warnings = warningsFor(options, found, droppable, aesthetics.owners);

  /* Written beside the output and renamed over it, so a write that fails
     partway, on a full disk say, leaves the previous stylesheet whole rather
     than a truncated one a deploy would ship. */
  let temporary: string | undefined;
  let warning: string | undefined;

  try {
    await fs.mkdir(path.dirname(target), { recursive: true });

    const created = await createTemporary(target);

    temporary = created.path;
    try {
      await created.handle.writeFile(css);
      warning = await keepOwnershipOf(created.handle, target, options.output);
    } finally {
      await created.handle.close();
    }
    await replaceFile(temporary, target);
  } catch (error) {
    // Best effort, and only for a file this build created: the error worth reporting is the one above.
    if (temporary !== undefined) {
      await fs.rm(temporary, { force: true }).catch(() => undefined);
    }
    throw new Error(`cannot write --output ${options.output}: ${describeWriteError(error)}`);
  }

  // After the rename, so a build that fails prints its one line and no warning.
  for (const line of warning === undefined ? warnings : [...warnings, warning]) {
    io.stderr(line);
  }

  return output;
}

type Tree = ReturnType<typeof parse>;

/* Each aesthetic's stylesheet, parsed, and the classes only it styles, by the
   aesthetic they belong to: those its file names that the stylesheet does not,
   under the aesthetic's name or a name that starts with it, such as
   `glass-liquid` and `glass-solo`. An aesthetic's file names the others'
   classes too, to leave them alone, so being named in it does not make a class
   its own. Read from the build, so a new aesthetic or class needs no change
   here. */
async function readAesthetics(
  names: readonly string[],
  stylesheetClasses: ReadonlySet<string>,
): Promise<{ trees: Map<string, Tree>; owners: Map<string, string> }> {
  const trees = new Map<string, Tree>();
  const owners = new Map<string, string>();
  const files = await Promise.all(names.map((name) => readPackageFile(resolveExport(`./aesthetics/${name}`))));

  for (const [index, name] of names.entries()) {
    const tree = parse(files[index] ?? "");

    trees.set(name, tree);
    for (const className of classesOf(tree)) {
      if (!stylesheetClasses.has(className) && (className === name || className.startsWith(`${name}-`))) {
        owners.set(className, name);
      }
    }
  }

  return { trees, owners };
}

/* A build that finds no class still writes the theme and the reset, and exits
   0, since a page may use the tokens and the reset alone; but a site whose
   globs name the wrong files loses its styling that way, so it is said. An
   aesthetic's class is styled only under its `--aesthetic`, which a template
   cannot ask for, so a class named without it is said too, rather than taken
   as the request. */
function warningsFor(
  options: BuildOptions,
  found: ReadonlySet<string>,
  droppable: ReadonlySet<string>,
  owners: ReadonlyMap<string, string>,
): string[] {
  const warnings: string[] = [];

  if (![...found].some((name) => droppable.has(name))) {
    const entries = options.contentGlobs.map((entry) => `"${entry}"`).join(", ");

    warnings.push(
      `${BIN}: warning: --content ${entries} names no StyleKit class, so the stylesheet holds only the theme and the reset; check that the globs name your templates.`,
    );
  }

  const unrequested = new Map<string, string[]>();

  for (const name of [...found].sort()) {
    const owner = owners.get(name);

    if (owner !== undefined && !options.aesthetics.includes(owner)) {
      unrequested.set(owner, [...(unrequested.get(owner) ?? []), name]);
    }
  }
  for (const [aesthetic, names] of unrequested) {
    const quoted = names.map((name) => `"${name}"`);
    const listed = quoted.length === 1 ? quoted[0] : `${quoted.slice(0, -1).join(", ")} and ${quoted.at(-1)}`;

    warnings.push(
      `${BIN}: warning: --content names ${listed}, which only --aesthetic ${aesthetic} styles; add --aesthetic ${aesthetic}, or leave the class out.`,
    );
  }

  return warnings;
}

/* The files this package ships under `dist/`, by size, so a content file is
   compared with one only when the sizes agree. */
async function readShippedSizes(): Promise<Map<number, string[]>> {
  const dist = path.join(packageRoot, "dist");
  const sizes = new Map<number, string[]>();
  const entries = await fs.readdir(dist, { recursive: true, withFileTypes: true });

  for (const entry of entries.filter((dirent) => dirent.isFile())) {
    const file = path.join(entry.parentPath, entry.name);
    // oxlint-disable-next-line no-await-in-loop -- a few dozen files at most
    const { size } = await fs.stat(file);

    sizes.set(size, [...(sizes.get(size) ?? []), file]);
  }

  return sizes;
}

/* A copy of what this package ships, or of what this command wrote, names
   every class it holds, so read as content it kept them all: Django's
   `collectstatic` copies the package's `dist/` into `staticfiles/`, and two
   builds over one folder read each other. A file that starts with the
   package's notice is one of them; so is a JSON list of class names holding at
   least half of this version's, as a copy of `purge/classes.json` from this or
   a nearby version does and a safelist does not; and so is a file the same as
   one this version ships, such as an aesthetic, which carries no notice. */
async function isPackageCopy(
  content: string,
  droppable: ReadonlySet<string>,
  shipped: ReadonlyMap<number, readonly string[]>,
): Promise<boolean> {
  if (WRITTEN_HEAD.test(content.slice(0, HEAD_BYTES))) {
    return true;
  }
  if (/^\s*\[/.test(content) && isClassList(content, droppable)) {
    return true;
  }

  for (const file of shipped.get(Buffer.byteLength(content)) ?? []) {
    // oxlint-disable-next-line no-await-in-loop -- rarely more than one file of a size
    if ((await fs.readFile(file, "utf8")) === content) {
      return true;
    }
  }

  return false;
}

function isClassList(content: string, droppable: ReadonlySet<string>): boolean {
  let list: unknown;

  try {
    list = JSON.parse(content);
  } catch {
    return false;
  }

  return (
    Array.isArray(list) &&
    list.every((item) => typeof item === "string") &&
    list.filter((item: string) => droppable.has(item)).length >= droppable.size / 2
  );
}

/* A name anyone could guess, such as one from the process ID, let whoever can
   write to the output's folder plant a link there first, and the write went
   through it to a file the build was never given. The name is random, and the
   file is created with `wx`, which fails on any entry already there, a link
   included, so the file written is always one this build created. Everything
   after goes through the handle, never the name. */
async function createTemporary(target: string): Promise<{ path: string; handle: fs.FileHandle }> {
  for (let attempt = 1; ; attempt += 1) {
    const name = `${target}.${randomBytes(8).toString("hex")}.tmp`;

    try {
      // oxlint-disable-next-line no-await-in-loop -- a name is tried only once the one before it is taken
      return { path: name, handle: await fs.open(name, "wx") };
    } catch (error) {
      if ((error as { code?: string }).code !== "EEXIST" || attempt === 5) {
        throw error;
      }
    }
  }
}

/* The stylesheet is renamed over the output, so it would come out with the mode
   and owner of a new file: a `0640` file of the web server's group would come
   back `0644` and the runner's. The temporary file takes the permission bits,
   owner, and group of the file it replaces first. Windows keeps neither: its
   mode is only the read-only attribute, which a rename over the file refuses,
   and a new file takes its folder's permissions. */
async function keepOwnershipOf(handle: fs.FileHandle, target: string, output: string): Promise<string | undefined> {
  if (process.platform === "win32") {
    return undefined;
  }

  const previous = await fs.stat(target).catch((error: unknown) => {
    if ((error as { code?: string }).code === "ENOENT") {
      return undefined;
    }
    throw error;
  });

  return previous === undefined ? undefined : keepOwnership(handle, previous, output);
}

/** What {@link keepOwnership} changes: the temporary file, through its handle. */
export interface OwnedFile {
  stat(): Promise<{ uid: number; gid: number }>;
  chown(uid: number, gid: number): Promise<void>;
  chmod(mode: number): Promise<void>;
}

/**
 * Gives `file` the owner, group, and permission bits of `previous`, and returns the warning to
 * print when it could not keep them all. Only root can give a file to another user, and only to a
 * group its owner is in, so a runner without that right keeps the group when it is in it, and says
 * what changed rather than fail a build that wrote the stylesheet.
 */
export async function keepOwnership(
  file: OwnedFile,
  previous: { uid: number; gid: number; mode: number },
  output: string,
): Promise<string | undefined> {
  const created = await file.stat();
  let warning: string | undefined;

  if (previous.uid !== created.uid || previous.gid !== created.gid) {
    const kept = await chownAllowed(file, previous.uid, previous.gid);
    /* The previous owner read the file by the owner's bit. Without the owner,
       only the bits of the group, while it is kept, and of others still let
       them, so a `0600` file of the web server's is one the server may no
       longer read, which "its mode is kept" alone did not say. */
    const stillRead = kept === "group" ? 0o044 : 0o004;
    /* The same for the previous group: a `0640` file the web server reads
       through its group is one it may no longer read once the group is gone. */
    const lostReaders = [
      previous.uid !== created.uid && (previous.mode & 0o400) !== 0 && (previous.mode & stillRead) === 0
        ? `user ${previous.uid}`
        : undefined,
      previous.gid !== created.gid &&
      kept === "neither" &&
      (previous.mode & 0o040) !== 0 &&
      (previous.mode & 0o004) === 0
        ? `the members of group ${previous.gid}`
        : undefined,
    ].filter((reader) => reader !== undefined);
    const unreadable =
      lostReaders.length === 0 ? "" : `, so ${lostReaders.join(" and ")} may no longer be able to read it`;

    if (previous.uid === created.uid) {
      // Only the group was to change.
      if (kept === "neither") {
        warning = `${BIN}: warning: --output ${output} now belongs to group ${created.gid}, not ${previous.gid}, since only root can give a file to a group you are not in; its owner and mode are kept${unreadable}.`;
      }
    } else if (kept === "group") {
      warning = `${BIN}: warning: --output ${output} now belongs to user ${created.uid}, not ${previous.uid}, since only root can give a file to another user; its group and mode are kept${unreadable}.`;
    } else if (kept === "neither") {
      warning = `${BIN}: warning: --output ${output} now belongs to user ${created.uid} and group ${created.gid}, not ${previous.uid} and ${previous.gid}, since only root can give a file to another user or to a group you are not in; its mode is kept${unreadable}.`;
    }
  }
  // After the owner: changing it can clear the set-user-ID and set-group-ID bits.
  await file.chmod(previous.mode & 0o777);

  return warning;
}

/* Gives the file to the user and group, or to the group alone when only root
   could give it to the user. Any failure but that refusal is thrown. */
async function chownAllowed(file: OwnedFile, uid: number, gid: number): Promise<"both" | "group" | "neither"> {
  const isRefused = (error: unknown) => (error as { code?: string }).code === "EPERM";

  try {
    await file.chown(uid, gid);
    return "both";
  } catch (error) {
    if (!isRefused(error)) {
      throw error;
    }
  }
  try {
    await file.chown(-1, gid);
    return "group";
  } catch (error) {
    if (!isRefused(error)) {
      throw error;
    }
  }

  return "neither";
}

/* Node.js names the path a system call failed on, and here that is mostly the
   temporary file, a name the user never gave and cannot find afterwards. The
   message keeps Node.js's reason and code, drops the paths, and says what to do. */
function describeWriteError(error: unknown): string {
  const { code } = error as { code?: unknown };

  if (!(error instanceof Error) || typeof code !== "string" || !error.message.startsWith(`${code}: `)) {
    return error instanceof Error ? error.message : String(error);
  }

  // As in "EACCES: permission denied, open '/srv/app.css.42.tmp'".
  const reason = error.message.slice(code.length + 2).replace(/, \w+ '.*$/s, "");
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
   What it writes starts with the package's notice, after Tailwind's banner, so
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

  // `\s` takes a byte order mark too. A notice past the bytes read is not found, and the file is refused.
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

    const content = matched.filter((file) => !isOutputOrTemporary(realPathSyncOf(file), output));

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

/* The output, or a temporary file of `createTemporary` a build killed before
   its rename left beside it: read as content, that held the classes of the
   last build, which a build would then keep. `path.relative` compares the
   output's part as the platform does, without case on Windows. */
function isOutputOrTemporary(file: string, output: string): boolean {
  return (
    path.relative(file.slice(0, output.length), output) === "" &&
    /^(?:\.[0-9a-f]{16}\.tmp)?$/.test(file.slice(output.length))
  );
}

/* Content is read as text and never run, as Tailwind reads it: every run of
   characters a class name can hold is a word, and a word counts when it is a
   class this package defines. A word that is not one is read again by its
   parts around each colon, so Svelte's `class:primary={isPrimary}` and a Ruby
   `btn: true` are found. The parts are taken one at a time: a word can be as
   long as the file, and `split(":")` made an array of every part, so a 160 MB
   file of colons aborted Node.js and a 192 MB one of `a:` took 1.6 GB. */
export function* findClasses(
  content: string,
  known: Pick<ReadonlySet<string>, "has">,
): Generator<string, void, undefined> {
  for (const word of splitWords(content, String.raw`\w:-`)) {
    if (known.has(word)) {
      yield word;
      continue;
    }
    for (let from = 0, colon = word.indexOf(":"); colon !== -1; from = colon + 1) {
      colon = word.indexOf(":", from);

      const part = word.slice(from, colon === -1 ? undefined : colon);

      if (part !== "" && known.has(part)) {
        yield part;
      }
    }
  }
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

/* Windows refuses to rename over a file another process holds open without
   delete sharing, which an antivirus scan or a dev server does for a moment
   after a write. The rename is retried briefly there; elsewhere it is atomic
   and fails only for a reason a retry does not fix. */
async function replaceFile(from: string, to: string): Promise<void> {
  const busy = new Set(["EACCES", "EBUSY", "EPERM"]);

  for (let attempt = 1; ; attempt += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- each attempt waits on the one before
      await fs.rename(from, to);
      return;
    } catch (error) {
      if (process.platform !== "win32" || attempt === 10 || !busy.has((error as { code?: string }).code ?? "")) {
        throw error;
      }

      // oxlint-disable-next-line no-await-in-loop -- the backoff between attempts
      await new Promise((resolve) => setTimeout(resolve, attempt * 20));
    }
  }
}

function assertNodeVersion(nodeVersion: string): void {
  if (Number.parseInt(nodeVersion, 10) < MIN_NODE_MAJOR) {
    throw new Error(`this command needs Node.js ${MIN_NODE_MAJOR} or newer; this is Node.js ${nodeVersion}.`);
  }
}

/* The file a link leads to, or the path itself while nothing is there yet. A
   link whose target does not exist yet still leads there: the stylesheet is
   written where it points rather than over the link. */
async function realPathOf(file: string): Promise<string> {
  try {
    return await fs.realpath(file);
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") {
      throw error;
    }

    return process.platform === "win32" ? windowsTargetOf(file) : posixTargetOf(file);
  }
}

/* Windows collapses a `..` before it follows any link, as `path.resolve` does. */
async function windowsTargetOf(file: string): Promise<string> {
  const link = await fs.readlink(file).catch(() => undefined);

  return link === undefined ? file : realPathOf(path.resolve(path.dirname(file), link));
}

/* POSIX follows each name in turn, a link included, before the `..` after it,
   so `alias/../real.css` with `alias` a link into another folder is a
   `real.css` there. `path.resolve` collapses the `..` first and named another
   file, which the build overwrote without checking it. The walk does what the
   system does: a link's target replaces it, and a `..` steps out of the folder
   reached so far. A folder that does not exist yet is created by the write, so
   the names after it are taken as written; a `..` after one has no folder to
   step out of, and the system refuses the path, so this does too. */
async function posixTargetOf(file: string): Promise<string> {
  const names = (value: string) => value.split("/").filter((name) => name !== "" && name !== ".");
  const pending = names(file);
  let current = "/";
  let missing = false;
  let links = 0;

  for (let name = pending.shift(); name !== undefined; name = pending.shift()) {
    if (name === "..") {
      if (missing) {
        throw new Error(`cannot follow the --output link at ${file}: it leads out of a folder that does not exist.`);
      }
      current = path.dirname(current);
      continue;
    }

    const next = path.join(current, name);

    if (missing) {
      current = next;
      continue;
    }

    let link: string | undefined;

    try {
      // oxlint-disable-next-line no-await-in-loop -- each name is read from the folder the one before it reached
      link = await fs.readlink(next);
    } catch (error) {
      const { code } = error as { code?: string };

      if (code === "ENOENT") {
        missing = true;
      } else if (code !== "EINVAL") {
        throw error;
      }
    }

    if (link === undefined) {
      current = next;
      continue;
    }

    // The system's own limit is 40 on Linux; past it, a chain of links is a loop.
    links += 1;
    if (links > 40) {
      throw new Error(`cannot follow the --output link at ${file}: its links lead in a loop.`);
    }
    if (path.isAbsolute(link)) {
      current = "/";
    }
    pending.unshift(...names(link));
  }

  return current;
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
