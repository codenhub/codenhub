import { execFileSync, spawnSync } from "node:child_process";
import { chmod, chown, lstat, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { classesOf, parse } from "../../src/cli/purge";
import { findClasses, findPackageRoot, keepOwnership, run } from "../../src/cli/run";

const { version } = createRequire(import.meta.url)("../../package.json") as { version: string };
const packageRoot = path.resolve(import.meta.dirname, "../..");

let root: string;
let project: string;
let stdout: string[];
let stderr: string[];
let nodeVersion: string;

/* Windows lets only an administrator or developer mode create a symbolic link. */
const canSymlink = await (async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "chs-cli-link-"));

  try {
    await symlink(path.join(folder, "target"), path.join(folder, "link"), "file");

    return true;
  } catch {
    return false;
  } finally {
    await rm(folder, { force: true, recursive: true });
  }
})();

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "chs-cli-test-"));
  project = path.join(root, "project");
  await mkdir(path.join(project, "app", "views"), { recursive: true });
  await writeFile(path.join(project, "app", "views", "show.html.erb"), '<button class="btn primary">Save</button>\n');
  stdout = [];
  stderr = [];
  nodeVersion = process.versions.node;
});

afterEach(async () => {
  await rm(root, { force: true, recursive: true });
});

function build(...argv: string[]): Promise<number> {
  return run(argv, {
    cwd: project,
    nodeVersion,
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
  });
}

function readOutput(name = "app.css"): Promise<string> {
  return readFile(path.join(project, name), "utf8");
}

/* A rule whose selector list starts with the class. A class can also appear
   inside another class's selector, as `.neutral.tooltip-bubble` and
   `:is(.data-table, .data-table tr).neutral` do in the `neutral` family rules
   that ship with every build, without its component being built. */
function ruleFor(className: string): RegExp {
  return new RegExp(String.raw`(?:^|[{}])\s*\.${className}(?![\w-])`);
}

describe("build", () => {
  it("emits only the classes the templates use", async () => {
    expect(await build("build", "--content", "app/views/**/*.erb", "--output", "app.css")).toBe(0);

    const css = await readOutput();

    expect(css).toMatch(ruleFor("btn"));
    expect(css).not.toMatch(ruleFor("data-table"));
    expect(css).not.toMatch(ruleFor("tooltip-bubble"));
  });

  it("reports the output path and its size in bytes", async () => {
    await build("build", "-c", "app/views/**/*.erb", "-o", "app.css");

    const { size } = await stat(path.join(project, "app.css"));

    expect(stderr).toEqual([]);
    expect(stdout).toEqual([`${path.join(project, "app.css")} ${size} bytes`]);
  });

  it("reads classes from every --content glob", async () => {
    await mkdir(path.join(project, "safelist"));
    await writeFile(path.join(project, "safelist", "classes.txt"), "data-table\n");

    expect(await build("build", "-c", "app/views/**/*.erb", "-c", "safelist/classes.txt", "-o", "app.css")).toBe(0);

    const css = await readOutput();

    expect(css).toMatch(ruleFor("btn"));
    expect(css).toMatch(ruleFor("data-table"));
  });

  // What Windows PowerShell 5.1's `"data-table" > safelist.txt` writes: UTF-16 LE after a byte order mark.
  it("reads classes from a UTF-16 safelist", async () => {
    await writeFile(
      path.join(project, "safelist.txt"),
      Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("data-table\r\n", "utf16le")]),
    );

    expect(await build("build", "-c", "app/views/**/*.erb", "-c", "safelist.txt", "-o", "app.css")).toBe(0);
    expect(await readOutput()).toMatch(ruleFor("data-table"));
  });

  // Read as a glob, `[id]` is a set matching the one letter `i` or `d`, so the file would match nothing.
  it("reads a --content path whose name holds a bracket as that file", async () => {
    await mkdir(path.join(project, "app", "[id]"));
    await writeFile(path.join(project, "app", "[id]", "page.tsx"), '<table className="data-table" />\n');

    expect(await build("build", "-c", "app/[id]/page.tsx", "-o", "app.css")).toBe(0);
    expect(await readOutput()).toMatch(ruleFor("data-table"));
  });

  it("keeps a variant of a class the templates use", async () => {
    await writeFile(
      path.join(project, "app", "views", "list.html.erb"),
      '<button class="btn md:lg hover:primary">Save</button>\n',
    );

    await build("build", "-c", "app/views/**/*.erb", "-o", "app.css");

    const css = await readOutput();

    expect(css).toContain(String.raw`.md\:lg{`);
    expect(css).toContain(String.raw`.hover\:primary:hover{`);
    expect(css).not.toContain(String.raw`.md\:sm{`);
    expect(css).not.toContain(String.raw`.focus\:primary`);
  });

  it("finds a class written as a framework's class directive", async () => {
    await writeFile(path.join(project, "app", "views", "list.html.erb"), "<div class:soft={isQuiet}></div>\n");

    await build("build", "-c", "app/views/**/*.erb", "-o", "app.css");

    expect(await readOutput()).toMatch(ruleFor("soft"));
  });

  it("keeps the licence notice of the checkbox marks", async () => {
    await writeFile(
      path.join(project, "app", "views", "form.html.erb"),
      '<input type="checkbox" class="checkbox" />\n',
    );

    await build("build", "-c", "app/views/**/*.erb", "-o", "app.css");

    expect(await readOutput()).toMatch(/\/\*![^*]*Lucide[^*]*\*\//);
  });

  /* `.theme-dark` is written by a script at run time, so no template names it. */
  it("keeps the classes a page gets at run time", async () => {
    await build("build", "-c", "app/views/**/*.erb", "-o", "app.css");

    expect(await readOutput()).toContain(".theme-dark");
  });

  it("writes the complete stylesheet when the templates name every class", async () => {
    const complete = await readFile(path.join(packageRoot, "dist", "index.css"), "utf8");
    // Read with the command's own parser, so an escaped name such as `md\:lg` is named whole.
    const names = classesOf(parse(complete));

    await writeFile(path.join(project, "app", "views", "all.html.erb"), [...names].join(" "));
    await build("build", "-c", "app/views/**/*.erb", "-o", "app.css");

    expect(await readOutput()).toBe(complete);
  });

  it("builds without Tailwind installed, importing only Node.js built-ins", async () => {
    const bundle = await readFile(path.join(packageRoot, "dist", "cli.js"), "utf8");
    const imports = bundle.split("\n").filter((line) => line.startsWith("import "));

    expect(imports.length).toBeGreaterThan(0);
    expect(imports.filter((line) => !/ from "node:[\w/]+";$/.test(line))).toEqual([]);
    expect(bundle).not.toMatch(/\b(?:require|import)\(/);
  });

  it("adds a requested aesthetic", async () => {
    expect(await build("build", "-c", "app/views/**/*.erb", "-o", "app.css", "--aesthetic", "glass")).toBe(0);

    expect(await readOutput()).toMatch(ruleFor("glass"));
  });

  it("includes an aesthetic named twice once", async () => {
    await build("build", "-c", "app/views/**/*.erb", "-o", "once.css", "--aesthetic", "glass");
    await build("build", "-c", "app/views/**/*.erb", "-o", "twice.css", "--aesthetic", "glass", "--aesthetic", "glass");

    expect(await readOutput("twice.css")).toBe(await readOutput("once.css"));
  });

  it("leaves aesthetics out unless requested", async () => {
    await build("build", "-c", "app/views/**/*.erb", "-o", "app.css");

    expect(await readOutput()).not.toMatch(ruleFor("glass"));
  });

  /* Every browser StyleKit supports has `color-mix()` and `@property`, so
     Tailwind's fallbacks for older ones would be bytes that never apply. */
  it("writes no fallback for a browser below the supported ones", async () => {
    await build("build", "-c", "app/views/**/*.erb", "-o", "app.css");

    const css = await readOutput();

    expect(css).not.toContain("color-mix(in lab, red, red)");
    expect(css).not.toContain("@layer properties");
  });

  it("minifies by default", async () => {
    await build("build", "-c", "app/views/**/*.erb", "-o", "app.css");

    expect(await readOutput()).not.toMatch(/\n {2}\S/);
  });

  it("keeps the output readable with --no-minify", async () => {
    await build("build", "-c", "app/views/**/*.erb", "-o", "app.css", "--no-minify");

    expect(await readOutput()).toMatch(/\n {2}\S/);
  });

  it("creates the output's parent directories", async () => {
    expect(await build("build", "-c", "app/views/**/*.erb", "-o", "public/assets/app.css")).toBe(0);

    expect(await readOutput("public/assets/app.css")).toMatch(ruleFor("btn"));
  });

  it("does not scan the directory it runs in beyond --content", async () => {
    await writeFile(path.join(project, "notes.html"), '<div class="data-table"></div>\n');

    await build("build", "-c", "app/views/**/*.erb", "-o", "app.css");

    expect(await readOutput()).not.toMatch(ruleFor("data-table"));
  });

  // A dependency's demo page, or this package's own list of every class, would keep classes no template uses.
  it("keeps a wildcard out of node_modules unless the glob names it", async () => {
    await mkdir(path.join(project, "node_modules", "dep"), { recursive: true });
    await writeFile(path.join(project, "node_modules", "dep", "demo.html"), '<div class="data-table"></div>\n');

    expect(await build("build", "-c", "**/*.erb", "-c", "**/*.html", "-o", "skipped.css")).toBe(1);
    expect(stderr.join("\n")).toContain('"**/*.html" matches no file');

    expect(await build("build", "-c", "**/*.erb", "-o", "skipped.css")).toBe(0);
    expect(await readOutput("skipped.css")).not.toMatch(ruleFor("data-table"));

    expect(await build("build", "-c", "**/*.erb", "-c", "node_modules/**/*.html", "-o", "named.css")).toBe(0);
    expect(await readOutput("named.css")).toMatch(ruleFor("data-table"));
  });

  // The stylesheet names every class it keeps, `data-table` among them in the `neutral` rules, so read back it would keep them.
  it("does not read its own output as content when a glob matches it", async () => {
    const argv = ["build", "-c", "app/views/**/*", "-o", "app/views/app.css"];

    expect(await build(...argv)).toBe(0);
    const first = await readOutput("app/views/app.css");

    expect(await build(...argv)).toBe(0);
    expect(await readOutput("app/views/app.css")).toBe(first);
  });

  it.skipIf(!canSymlink)("does not read its own output through a link a glob matches", async () => {
    const argv = ["build", "-c", "app/views/*", "-o", "app.css"];

    expect(await build(...argv)).toBe(0);
    const first = await readOutput();

    await symlink(path.join(project, "app.css"), path.join(project, "app", "views", "alias.css"), "file");
    expect(await build(...argv)).toBe(0);
    expect(await readOutput()).toBe(first);
  });

  it.skipIf(!canSymlink)("writes through an --output that is a link, and keeps the link", async () => {
    await writeFile(path.join(project, "real.css"), "");
    await symlink(path.join(project, "real.css"), path.join(project, "app.css"), "file");

    expect(await build("build", "-c", "app/views/**/*.erb", "-o", "app.css")).toBe(0);
    expect((await lstat(path.join(project, "app.css"))).isSymbolicLink()).toBe(true);
    expect(await readOutput("real.css")).toMatch(ruleFor("btn"));
  });

  it.skipIf(!canSymlink)("writes where an --output link points before its target exists", async () => {
    await symlink(path.join(project, "build", "real.css"), path.join(project, "app.css"), "file");

    expect(await build("build", "-c", "app/views/**/*.erb", "-o", "app.css")).toBe(0);
    expect((await lstat(path.join(project, "app.css"))).isSymbolicLink()).toBe(true);
    expect(await readOutput("build/real.css")).toMatch(ruleFor("btn"));
  });

  /* The temporary file was named after the process ID, which anyone can guess,
     and written through whatever stood there, so a link planted at that name
     made the build overwrite a file it was never given. */
  it.skipIf(!canSymlink)("does not write through a link planted where its temporary file went", async () => {
    const victim = path.join(root, "victim.txt");

    await writeFile(victim, "keep me");
    await symlink(victim, path.join(project, `app.css.${process.pid}.tmp`), "file");

    expect(await build("build", "-c", "app/views/**/*.erb", "-o", "app.css")).toBe(0);
    expect(await readFile(victim, "utf8")).toBe("keep me");
    expect(await readOutput()).toMatch(ruleFor("btn"));
  });

  it("leaves no temporary file beside the output", async () => {
    expect(await build("build", "-c", "app/views/**/*.erb", "-o", "app.css")).toBe(0);
    expect((await readdir(project)).sort()).toEqual(["app", "app.css"]);
  });

  /* The stylesheet is renamed over the output, so it used to take the mode and
     owner a new file gets: a `0640` file of the web server's group came back
     `0644` and the runner's, readable by everyone and maybe not by the server. */
  it.skipIf(process.platform === "win32").each([
    ["0640", 0o640],
    ["0444", 0o444],
  ])("keeps the mode %s of the stylesheet it replaces", async (_, mode) => {
    const file = path.join(project, "app.css");

    expect(await build("build", "-c", "app/views/**/*.erb", "-o", "app.css")).toBe(0);
    await chmod(file, mode);
    expect(await build("build", "-c", "app/views/**/*.erb", "-o", "app.css", "--no-minify")).toBe(0);
    expect((await stat(file)).mode & 0o777).toBe(mode);
    expect(await readOutput()).toMatch(/\n {2}\S/);
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() !== 0)(
    "keeps the owner and group of the stylesheet it replaces, as root",
    async () => {
      const file = path.join(project, "app.css");

      expect(await build("build", "-c", "app/views/**/*.erb", "-o", "app.css")).toBe(0);
      await chown(file, 4321, 4322);
      expect(await build("build", "-c", "app/views/**/*.erb", "-o", "app.css")).toBe(0);
      expect(await stat(file)).toMatchObject({ uid: 4321, gid: 4322 });
      expect(stderr).toEqual([]);
    },
  );

  // A user can give a file they own to any group they are in.
  const otherGroup = process.getgroups?.().find((gid) => gid !== process.getegid?.());

  it.skipIf(process.platform === "win32" || otherGroup === undefined)(
    "keeps the group of the stylesheet it replaces",
    async () => {
      const file = path.join(project, "app.css");

      expect(await build("build", "-c", "app/views/**/*.erb", "-o", "app.css")).toBe(0);
      await chown(file, -1, otherGroup ?? -1);
      expect(await build("build", "-c", "app/views/**/*.erb", "-o", "app.css")).toBe(0);
      expect((await stat(file)).gid).toBe(otherGroup);
      expect(stderr).toEqual([]);
    },
  );

  /* POSIX follows `alias` before its `..`; Windows collapses the `..` first, so the case does not arise there. */
  it.skipIf(!canSymlink || process.platform === "win32")(
    "writes where an --output link points when its target climbs out of another link",
    async () => {
      const authored = "a { color: red; }";

      await mkdir(path.join(project, "nested", "dir"), { recursive: true });
      await symlink(path.join(project, "nested", "dir"), path.join(project, "alias"), "dir");
      await writeFile(path.join(project, "real.css"), authored);
      // Written whole: `path.join` would collapse the `..` this test is about.
      await symlink("alias/../real.css", path.join(project, "app.css"), "file");

      expect(await build("build", "-c", "app/views/**/*.erb", "-o", "app.css")).toBe(0);
      expect(await readOutput("real.css")).toBe(authored);
      expect(await readOutput("nested/real.css")).toMatch(ruleFor("btn"));
    },
  );
});

describe("failures", () => {
  /* Runs a build that has to fail, and returns its one line on stderr. */
  async function failureOf(...argv: string[]): Promise<string> {
    expect(await build(...argv)).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr).toHaveLength(1);
    expect(stderr[0]).not.toMatch(/\n\s+at /);

    return stderr[0] ?? "";
  }

  // POSIX refuses a `..` out of a folder that does not exist; collapsing it instead named an authored file.
  it.skipIf(!canSymlink || process.platform === "win32")(
    "refuses an --output link that leads out of a missing folder",
    async () => {
      const authored = "a { color: red; }";

      await mkdir(path.join(project, "nested", "dir"), { recursive: true });
      await symlink(path.join(project, "nested", "dir"), path.join(project, "alias"), "dir");
      await writeFile(path.join(project, "real.css"), authored);
      await writeFile(path.join(project, "nested", "real.css"), authored);
      await symlink("alias/../missing/../real.css", path.join(project, "app.css"), "file");

      expect(await failureOf("build", "-c", "app/views/**/*.erb", "-o", "app.css")).toMatch(
        /leads out of a folder that does not exist/,
      );
      expect(await readOutput("real.css")).toBe(authored);
      expect(await readOutput("nested/real.css")).toBe(authored);
    },
  );

  it("rejects a build without --content", async () => {
    expect(await failureOf("build", "-o", "app.css")).toMatch(/--content/);
  });

  it("rejects a build without --output", async () => {
    expect(await failureOf("build", "-c", "app/views/**/*.erb")).toMatch(/--output/);
  });

  // A quoted variable left empty by a script; written as given, it names a file of spaces.
  it("takes an --output of only spaces as missing", async () => {
    expect(await failureOf("build", "-c", "app/views/**/*.erb", "-o", "  ")).toBe(
      "chs: missing --output; name the stylesheet to write, as in --output public/app.css.",
    );
    expect(await readdir(project)).not.toContain("  ");
  });

  it("rejects an unknown flag by name", async () => {
    expect(await failureOf("build", "-c", "app/views/**/*.erb", "-o", "app.css", "--watch")).toMatch(/--watch/);
  });

  it("rejects a flag given without its value", async () => {
    expect(await failureOf("build", "-o", "app.css", "-c")).toMatch(/"--content" is missing its value/);
  });

  it("rejects an unknown aesthetic and lists the valid ones", async () => {
    expect(await failureOf("build", "-c", "app/views/**/*.erb", "-o", "app.css", "--aesthetic", "glas")).toMatch(
      /"glas".*chunky-tile.*cyber.*glass.*neobrutalism.*pixel.*sketch/,
    );
  });

  /* `./aesthetics/tw` is the Tailwind source of every aesthetic, an export
     beside the aesthetics, not one of them. */
  it("does not take the Tailwind source of the aesthetics for an aesthetic", async () => {
    expect(await failureOf("build", "-c", "app/views/**/*.erb", "-o", "app.css", "--aesthetic", "tw")).toBe(
      'chs: unknown aesthetic "tw"; choose from chunky-tile, cyber, glass, neobrutalism, pixel, sketch.',
    );
  });

  it("rejects a --content glob that matches no file, naming it", async () => {
    expect(await failureOf("build", "-c", "app/view/**/*.erb", "-o", "app.css")).toMatch(/app\/view\/\*\*\/\*\.erb/);
  });

  // After a build into public/, the glob matched only the stylesheet, which is never read, so the build read nothing.
  it("rejects a --content glob that matches only the --output", async () => {
    expect(await build("build", "-c", "app/views/**/*.erb", "-o", "public/s.css")).toBe(0);
    stdout = [];

    expect(await failureOf("build", "-c", "public/*.css", "-o", "public/s.css")).toBe(
      'chs: --content "public/*.css" matches only --output public/s.css, which is never read for classes; name the templates to scan.',
    );
  });

  // `path.resolve` drops a trailing separator, so `-o newdir/` wrote a file named `newdir`.
  it.each(["newdir/", ...(process.platform === "win32" ? ["newdir\\"] : [])])(
    "refuses an --output that ends with a separator, as %s",
    async (output) => {
      expect(await failureOf("build", "-c", "app/views/**/*.erb", "-o", output)).toBe(
        `chs: --output ${output} ends with a folder separator, so it names a folder, not a file; name a stylesheet to write, as in --output ${output}app.css.`,
      );
      expect(await readdir(project)).toEqual(["app"]);
    },
  );

  // `path.resolve` takes `newdir/.` for `newdir`, so it wrote a file named `newdir` too.
  it.each([
    ["newdir/.", "newdir/./app.css"],
    ["newdir/..", "newdir/../app.css"],
    ["newdir/sub/..", "newdir/sub/../app.css"],
    ...(process.platform === "win32" ? [["newdir\\.", "newdir\\.\\app.css"]] : []),
  ])("refuses an --output whose last segment is . or .., as %s", async (output, example) => {
    expect(await failureOf("build", "-c", "app/views/**/*.erb", "-o", output)).toBe(
      `chs: --output ${output} ends with a . or .. segment, so it names a folder, not a file; name a stylesheet to write, as in --output ${example}.`,
    );
    expect(await readdir(project)).toEqual(["app"]);
  });

  // parseArgs keeps the last value, so `-o a.css -o b.css` wrote only b.css and said nothing of a.css.
  it("refuses --output given twice", async () => {
    expect(await failureOf("build", "-c", "app/views/**/*.erb", "-o", "a.css", "--output=b.css")).toBe(
      "chs: --output is given more than once; name one stylesheet to write.",
    );
    expect(await readdir(project)).toEqual(["app"]);
  });

  // parseArgs takes `-a.css` for a flag, and its own advice, to write `--output=-a.css`, was dropped.
  it.each([
    ["-o", "--output"],
    ["--content", "--content"],
  ])("says how to give %s a value that starts with a dash", async (flag, name) => {
    expect(await failureOf("build", "-c", "app/views/**/*.erb", "-o", "app.css", flag, "-a.css")).toBe(
      `chs: option "${name}" is missing its value; to give it a value that starts with a dash, write ${name}=-a.css.`,
    );
  });

  // A value left out before the next option was told to be written as `--content=-o`.
  it.each([
    [["-c", "-o", "out.css"], "--content"],
    [["-c", "a.html", "-o", "--no-minify"], "--output"],
    [["--content", "--output=out.css"], "--content"],
    [["-c", "a.html", "--output", "--aesthetic", "glass"], "--output"],
    [["-c", "a.html", "-o", "--help"], "--output"],
  ])("says only that a value is missing when %j gives the next option instead", async (args, name) => {
    expect(await failureOf("build", ...args)).toBe(
      `chs: option "${name}" is missing its value; run "chs --help" for the options.`,
    );
  });

  it("says a --content folder is a folder and shows a glob for its files", async () => {
    expect(await failureOf("build", "-c", "app/views", "-o", "app.css")).toBe(
      `chs: --content "app/views" is a folder in ${project}, not a file; name the files in it, as in "app/views/**/*".`,
    );
  });

  it("rejects extra arguments, which an unquoted glob expanded by the shell produces", async () => {
    expect(await failureOf("build", "-c", "app/views/a.html.erb", "app/views/b.html.erb", "-o", "app.css")).toMatch(
      /app\/views\/b\.html\.erb.*quote/,
    );
  });

  it("rejects a missing command", async () => {
    expect(await failureOf("-c", "app/views/**/*.erb", "-o", "app.css")).toMatch(/build/);
  });

  it("rejects an unknown command", async () => {
    expect(await failureOf("watch", "-c", "app/views/**/*.erb", "-o", "app.css")).toMatch(/"watch"/);
  });

  it("rejects a Node.js older than it supports, naming both versions", async () => {
    nodeVersion = "24.22.1";

    expect(await failureOf("build", "-c", "app/views/**/*.erb", "-o", "app.css")).toBe(
      "chs: this command needs Node.js 26 or newer; this is Node.js 24.22.1.",
    );
  });

  it("refuses an --output that is a folder, and leaves it", async () => {
    await mkdir(path.join(project, "app.css"));

    expect(await failureOf("build", "-c", "app/views/**/*.erb", "-o", "app.css")).toBe(
      "chs: --output app.css is a folder, not a file; name a stylesheet to write.",
    );
    expect(await readdir(path.join(project, "app.css"))).toEqual([]);
  });

  /* Renaming over a pipe replaces it with a file, and as root renaming over a
     device does too, so `-o /dev/null` turned `/dev/null` into a stylesheet. */
  it.skipIf(process.platform === "win32")("refuses an --output that is a pipe, and leaves it", async () => {
    const pipe = path.join(project, "app.css");

    execFileSync("mkfifo", [pipe]);

    expect(await failureOf("build", "-c", "app/views/**/*.erb", "-o", "app.css")).toBe(
      "chs: --output app.css is a pipe, not a file; name a stylesheet to write.",
    );
    expect((await lstat(pipe)).isFIFO()).toBe(true);
    expect(await readdir(project)).toEqual(["app", "app.css"]);
  });

  it.skipIf(!canSymlink || process.platform === "win32")(
    "refuses an --output link that leads to a device, and leaves it",
    async () => {
      await symlink("/dev/null", path.join(project, "app.css"), "file");

      expect(await failureOf("build", "-c", "app/views/**/*.erb", "-o", "app.css")).toBe(
        "chs: --output app.css is a device, not a file; name a stylesheet to write.",
      );
      expect((await stat("/dev/null")).isCharacterDevice()).toBe(true);
    },
  );

  /* The write goes through a file beside the output, so Node.js's message named
     that file, which the user never gave, and not the --output they did. */
  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "names the --output it cannot write, not the file it writes through",
    async () => {
      await mkdir(path.join(project, "locked"), { mode: 0o555 });

      try {
        expect(await failureOf("build", "-c", "app/views/**/*.erb", "-o", "locked/app.css")).toBe(
          "chs: cannot write --output locked/app.css: permission denied (EACCES); check that you can write to it and to its folder, or name another file.",
        );
      } finally {
        await chmod(path.join(project, "locked"), 0o755);
      }
    },
  );

  /* The output is replaced whole, so naming a template or a hand-written
     stylesheet as the output by mistake used to lose it. */
  it("refuses an output that is also a --content file, and leaves it", async () => {
    const template = path.join(project, "app", "views", "show.html.erb");

    expect(await failureOf("build", "-c", "app/views/show.html.erb", "-o", "app/views/show.html.erb")).toBe(
      "chs: --output app/views/show.html.erb is also a --content file; name a stylesheet to write.",
    );
    expect(await readFile(template, "utf8")).toBe('<button class="btn primary">Save</button>\n');
  });

  it("refuses to replace a file it did not write, and leaves it", async () => {
    await writeFile(path.join(project, "app.css"), ".mine { color: red; }\n");

    expect(await failureOf("build", "-c", "app/views/**/*.erb", "-o", "app.css")).toBe(
      "chs: --output app.css holds something this command did not write; move it or name another file.",
    );
    expect(await readOutput()).toBe(".mine { color: red; }\n");
  });

  /* A stylesheet written by hand often opens with a layer order, and a vendor
     file with its own `/*!` banner; what this command writes carries the
     package's notice after Tailwind's banner. */
  it.each([
    ["a layer order", "@layer reset, theme, base, components, utilities;\n@layer reset { .mine { color: red; } }\n"],
    ["another banner", "/*! normalize.css v8.0.1 | MIT License */\nhtml { line-height: 1.15; }\n"],
    ["a rule before the notice", "/*! vendor */\n.mine { color: red; }\n/*! @codenhub/styles | Apache-2.0 */\n"],
  ])("refuses a stylesheet written by hand that starts with %s, and leaves it", async (_, css) => {
    await writeFile(path.join(project, "app.css"), css);

    expect(await failureOf("build", "-c", "app/views/**/*.erb", "-o", "app.css")).toMatch(/did not write/);
    expect(await readOutput()).toBe(css);
  });

  // Tailwind's CLI reads `-` as standard output; this command writes only a file.
  it("refuses - as the output, which would name a file -", async () => {
    expect(await failureOf("build", "-c", "app/views/**/*.erb", "-o", "-")).toBe(
      "chs: --output - would write a file named -; this command writes no standard output, so name a stylesheet, as in --output public/app.css.",
    );
  });

  it("refuses a file whose first bytes are only whitespace", async () => {
    await writeFile(path.join(project, "app.css"), `${" ".repeat(2048)}.mine { color: red; }`);

    expect(await failureOf("build", "-c", "app/views/**/*.erb", "-o", "app.css")).toMatch(/did not write/);
  });

  /* Renaming over a file needs the directory's permission, not the file's, so
     a file the command cannot read could still be replaced unchecked. POSIX
     modes only: Windows ignores them, and root reads the file anyway. */
  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "refuses a file it cannot read, and leaves it",
    async () => {
      const file = path.join(project, "app.css");

      await writeFile(file, ".mine { color: red; }");
      await chmod(file, 0o200);

      expect(await failureOf("build", "-c", "app/views/**/*.erb", "-o", "app.css")).toMatch(
        /^chs: cannot read --output app\.css to check/,
      );
      await chmod(file, 0o600);
      expect(await readOutput()).toBe(".mine { color: red; }");
    },
  );

  /* Windows refuses to rename over a file with the read-only attribute, where
     POSIX replaces a read-only file and keeps its mode. */
  it.skipIf(process.platform !== "win32")("refuses a read-only stylesheet on Windows, and leaves it", async () => {
    const file = path.join(project, "app.css");

    expect(await build("build", "-c", "app/views/**/*.erb", "-o", "app.css")).toBe(0);
    const previous = await readOutput();

    stdout = [];
    await chmod(file, 0o444);

    try {
      expect(await failureOf("build", "-c", "app/views/**/*.erb", "-o", "app.css", "--no-minify")).toBe(
        "chs: cannot write --output app.css: operation not permitted (EPERM); check that you can write to it and to its folder, or name another file.",
      );
      expect(await readOutput()).toBe(previous);
    } finally {
      await chmod(file, 0o644);
    }
  });

  it("replaces a stylesheet it wrote, and an empty file", async () => {
    await writeFile(path.join(project, "empty.css"), "");

    expect(await build("build", "-c", "app/views/**/*.erb", "-o", "app.css")).toBe(0);
    expect(await build("build", "-c", "app/views/**/*.erb", "-o", "app.css", "--no-minify")).toBe(0);
    expect(await build("build", "-c", "app/views/**/*.erb", "-o", "empty.css")).toBe(0);
    expect(await readOutput("empty.css")).toMatch(ruleFor("btn"));
  });

  it("replaces a file that holds only whitespace", async () => {
    await writeFile(path.join(project, "app.css"), "﻿\r\n  \n");

    expect(await build("build", "-c", "app/views/**/*.erb", "-o", "app.css")).toBe(0);
    expect(await readOutput()).toMatch(ruleFor("btn"));
  });

  // The compiled stylesheets carry the notice too, so a copy of one is replaced as before.
  it("replaces a copy of a compiled stylesheet", async () => {
    await writeFile(path.join(project, "app.css"), await readFile(path.join(packageRoot, "dist", "index.css"), "utf8"));

    expect(await build("build", "-c", "app/views/**/*.erb", "-o", "app.css")).toBe(0);
  });
});

/* Every other test runs the source; these run the file `bin` names, as an
   installed package does, so a bundling mistake shows here. */
describe("the shipped command", () => {
  const cli = path.join(packageRoot, "dist", "cli.js");
  const spawn = (...argv: string[]) => spawnSync(process.execPath, [cli, ...argv], { cwd: project, encoding: "utf8" });

  it("builds and prints one line on stdout", async () => {
    const result = spawn("build", "-c", "app/views/**/*.erb", "-o", "app.css");
    const { size } = await stat(path.join(project, "app.css"));

    expect(result).toMatchObject({ status: 0, stderr: "", stdout: `${path.join(project, "app.css")} ${size} bytes\n` });
    expect(await readOutput()).toMatch(ruleFor("btn"));
  });

  it("fails with one chs: line on stderr", () => {
    const result = spawn("build", "-c", "app/view/**/*.erb", "-o", "app.css");

    expect(result).toMatchObject({ status: 1, stdout: "" });
    expect(result.stderr).toBe(
      `chs: --content "app/view/**/*.erb" matches no file in ${project}; check the path, or run from the project root.\n`,
    );
  });
});

describe("help and version", () => {
  it("prints usage with --help and exits 0", async () => {
    expect(await build("--help")).toBe(0);
    expect(stdout.join("\n")).toMatch(/chs build --content <glob>/);
    expect(stdout.join("\n")).toMatch(/--aesthetic <name> .*chunky-tile, cyber, glass, neobrutalism, pixel, sketch/);
    expect(stderr).toEqual([]);
  });

  it("prints the package version with --version and exits 0", async () => {
    expect(await build("--version")).toBe(0);
    expect(stdout).toEqual([version]);
  });
});

describe("findClasses", () => {
  it("finds the classes around each colon of a word", () => {
    const known = new Set(["btn", "primary", "md:lg"]);

    expect([...findClasses("class:primary btn: md:lg ::btn::", known)]).toEqual(["primary", "btn", "md:lg", "btn"]);
  });

  /* `split(":")` made an array of every part: a 160 MB file of colons aborted
     Node.js with no `chs:` line, and a 192 MB one of `a:` took 1.6 GB. */
  it("reads the parts of a word one at a time", () => {
    let lookups = 0;
    const known = {
      has(name: string) {
        lookups += 1;
        return name === "btn";
      },
    };
    const classes = findClasses(`btn${":".repeat(100_000)}`, known);

    expect(classes.next()).toEqual({ done: false, value: "btn" });
    expect(lookups).toBeLessThan(10);
  });
});

/* A test cannot make a file of another user without root, so the ownership
   rules run on a file whose calls are recorded and refused as a user's are. */
describe("keepOwnership", () => {
  const runner = { uid: 1000, gid: 1000 };

  function fileOf({ refuseOwner, refuseGroup }: { refuseOwner: boolean; refuseGroup: boolean }) {
    const calls: string[] = [];
    const refusal = () => Object.assign(new Error("EPERM: operation not permitted"), { code: "EPERM" });

    return {
      calls,
      stat: () => Promise.resolve(runner),
      chown(uid: number, gid: number) {
        calls.push(`chown ${uid} ${gid}`);
        return (uid === -1 ? refuseGroup : refuseOwner) ? Promise.reject(refusal()) : Promise.resolve();
      },
      chmod(mode: number) {
        calls.push(`chmod ${mode.toString(8)}`);
        return Promise.resolve();
      },
    };
  }

  it("gives the file the previous owner, group, and mode", async () => {
    const file = fileOf({ refuseOwner: false, refuseGroup: false });

    expect(await keepOwnership(file, { uid: 33, gid: 33, mode: 0o100640 }, "app.css")).toBeUndefined();
    expect(file.calls).toEqual(["chown 33 33", "chmod 640"]);
  });

  it("warns that the owner changed and the group and mode are kept", async () => {
    const file = fileOf({ refuseOwner: true, refuseGroup: false });

    expect(await keepOwnership(file, { uid: 33, gid: 33, mode: 0o100640 }, "app.css")).toBe(
      "chs: warning: --output app.css now belongs to user 1000, not 33, since only root can give a file to another user; its group and mode are kept.",
    );
    expect(file.calls).toEqual(["chown 33 33", "chown -1 33", "chmod 640"]);
  });

  it("warns that the owner and group changed and the mode is kept", async () => {
    const file = fileOf({ refuseOwner: true, refuseGroup: true });

    expect(await keepOwnership(file, { uid: 33, gid: 33, mode: 0o100644 }, "app.css")).toBe(
      "chs: warning: --output app.css now belongs to user 1000 and group 1000, not 33 and 33, since only root can give a file to another user or to a group you are not in; its mode is kept.",
    );
  });

  /* A `0600` file of the web server's came back the deploy user's, which the
     server could no longer read, under a warning that said the mode was kept.
     With the group gone too, a group read bit no longer reaches it either. */
  it.each([
    ["0600 with the group kept", false, 0o600, "its group and mode are kept"],
    ["0640 with the group changed", true, 0o640, "its mode is kept"],
  ])("warns that the previous owner may no longer read a file of mode %s", async (_, refuseGroup, mode, kept) => {
    const file = fileOf({ refuseOwner: true, refuseGroup });

    expect(await keepOwnership(file, { uid: 33, gid: 33, mode: 0o100000 | mode }, "app.css")).toMatch(
      new RegExp(`; ${kept}, so user 33 may no longer be able to read it\\.$`),
    );
  });

  // The runner owns a `0640` file of a group it is not in: the owner never changed, so no reader lost it.
  it("warns of the group alone when only the group could not be kept", async () => {
    const file = fileOf({ refuseOwner: true, refuseGroup: true });

    expect(await keepOwnership(file, { uid: 1000, gid: 33, mode: 0o100640 }, "app.css")).toBe(
      "chs: warning: --output app.css now belongs to group 1000, not 33, since only root can give a file to a group you are not in; its owner and mode are kept.",
    );
    expect(file.calls).toEqual(["chown 1000 33", "chown -1 33", "chmod 640"]);
  });

  it("throws a failure other than a refusal", async () => {
    const file = {
      ...fileOf({ refuseOwner: false, refuseGroup: false }),
      chown: () => Promise.reject(Object.assign(new Error("EIO: i/o error"), { code: "EIO" })),
    };

    await expect(keepOwnership(file, { uid: 33, gid: 33, mode: 0o100644 }, "app.css")).rejects.toThrow(/EIO/);
  });
});

/* The source runs from `src/cli/` and the bundle from `dist/`, two different
   depths below the package root, so the root is found by walking up. */
describe("findPackageRoot", () => {
  it("returns the nearest folder above that holds a package.json", async () => {
    const nested = path.join(root, "pkg", "dist", "deep");

    await mkdir(nested, { recursive: true });
    await writeFile(path.join(root, "pkg", "package.json"), "{}\n");

    expect(findPackageRoot(nested)).toBe(path.join(root, "pkg"));
  });

  it("returns the folder itself when it holds the package.json", async () => {
    await writeFile(path.join(project, "package.json"), "{}\n");

    expect(findPackageRoot(project)).toBe(project);
  });
});
