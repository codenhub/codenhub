import { existsSync, readFileSync, realpathSync } from "node:fs";
import * as fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { findFiles, readFiles, splitWords, UnmatchedEntryError } from "@codenhub/scan";

import { format, parse, purge, serialize } from "./purge";

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

  const output = path.resolve(io.cwd, options.output);

  await assertReplaceable(options, io.cwd, output);

  // Through a link, the file it leads to is the one written, and the one no glob may read.
  const target = await realPathOf(output);
  const contents = readContent(options.contentGlobs, io.cwd, target);

  const droppable = new Set(JSON.parse(await readPackageFile(PURGE_CLASSES)) as string[]);
  const found = new Set<string>();

  // One file at a time, so a broad glob holds only the file being read and the classes found so far.
  for (const content of contents) {
    for (const name of findClasses(content, droppable)) {
      found.add(name);
    }
  }
  // A class this command may not drop is one no template has to name, such as `.theme-dark`, so it always counts as used.
  const used = { has: (name: string) => found.has(name) || !droppable.has(name) };

  const stylesheets = await Promise.all(
    [PURGE_SOURCE, ...options.aesthetics.map((name) => resolveExport(`./aesthetics/${name}`))].map(readPackageFile),
  );
  const write = options.shouldMinify ? serialize : format;
  const css = stylesheets.map((stylesheet) => write(purge(parse(stylesheet), used))).join("");

  /* Written beside the output and renamed over it, so a write that fails
     partway, on a full disk say, leaves the previous stylesheet whole rather
     than a truncated one a deploy would ship. */
  const temporary = `${target}.${process.pid}.tmp`;

  try {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(temporary, css);
    await keepOwnership(temporary, target, options.output, io);
    await replaceFile(temporary, target);
  } catch (error) {
    // Best effort: the error worth reporting is the one above.
    await fs.rm(temporary, { force: true }).catch(() => undefined);
    throw new Error(`cannot write --output ${options.output}: ${describeWriteError(error)}`);
  }

  return output;
}

/* The stylesheet is renamed over the output, so it would come out with the mode
   and owner of a new file: a `0640` file of the web server's group would come
   back `0644` and the runner's. The temporary file takes the permission bits,
   owner, and group of the file it replaces first. Only root can give a file to
   another user, and only to a group its owner is in, so a runner without that
   right keeps the group when it is in it, and says what changed on stderr
   rather than fail a build that wrote the stylesheet. Windows keeps neither:
   its mode is only the read-only attribute, which a rename over the file
   refuses, and a new file takes its folder's permissions. */
async function keepOwnership(temporary: string, target: string, output: string, io: CliIo): Promise<void> {
  if (process.platform === "win32") {
    return;
  }

  const previous = await fs.stat(target).catch((error: unknown) => {
    if ((error as { code?: string }).code === "ENOENT") {
      return undefined;
    }
    throw error;
  });

  if (previous === undefined) {
    return;
  }

  const created = await fs.stat(temporary);

  if (previous.uid !== created.uid || previous.gid !== created.gid) {
    const kept = await chownAllowed(temporary, previous.uid, previous.gid);

    if (kept === "group") {
      io.stderr(
        `${BIN}: warning: --output ${output} now belongs to user ${created.uid}, not ${previous.uid}, since only root can give a file to another user; its group and mode are kept.`,
      );
    } else if (kept === "neither") {
      io.stderr(
        `${BIN}: warning: --output ${output} now belongs to user ${created.uid} and group ${created.gid}, not ${previous.uid} and ${previous.gid}, since only root can give a file to another user or to a group you are not in; its mode is kept.`,
      );
    }
  }
  // After the owner: changing it can clear the set-user-ID and set-group-ID bits.
  await fs.chmod(temporary, previous.mode & 0o777);
}

/* Gives the file to the user and group, or to the group alone when only root
   could give it to the user. Any failure but that refusal is thrown. */
async function chownAllowed(file: string, uid: number, gid: number): Promise<"both" | "group" | "neither"> {
  const isRefused = (error: unknown) => (error as { code?: string }).code === "EPERM";

  try {
    await fs.chown(file, uid, gid);
    return "both";
  } catch (error) {
    if (!isRefused(error)) {
      throw error;
    }
  }
  try {
    await fs.chown(file, -1, gid);
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
   grow with each build instead of following the templates. `path.relative` is
   empty for the same file, in the case Windows ignores. */
function readContent(entries: readonly string[], cwd: string, output: string): Generator<string> {
  try {
    const files = findFiles(entries, { cwd, failOnUnmatched: true }).filter(
      (file) => path.relative(realPathSyncOf(file), output) !== "",
    );

    return readFiles(files, { cwd, failOnUnreadable: true });
  } catch (error) {
    throw error instanceof UnmatchedEntryError ? new Error(`--content ${error.message}`) : error;
  }
}

/* Content is read as text and never run, as Tailwind reads it: every run of
   characters a class name can hold is a word, and a word counts when it is a
   class this package defines. A word that is not one is read again by its
   parts around each colon, so Svelte's `class:primary={isPrimary}` and a Ruby
   `btn: true` are found. */
function* findClasses(content: string, known: ReadonlySet<string>): Generator<string, void, undefined> {
  for (const word of splitWords(content, String.raw`\w:-`)) {
    if (known.has(word)) {
      yield word;
    } else if (word.includes(":")) {
      yield* word.split(":").filter((part) => known.has(part));
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
