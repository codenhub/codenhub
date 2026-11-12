import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { findPackageRoot, run } from "../../src/cli/run";

const { version } = createRequire(import.meta.url)("../../package.json") as { version: string };
const packageRoot = path.resolve(import.meta.dirname, "../..");

let root: string;
let project: string;
let stdout: string[];
let stderr: string[];
let nodeVersion: string;

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

  /* `.theme-dark` is written by a script at run time, so no template names it. */
  it("keeps the classes a page gets at run time", async () => {
    await build("build", "-c", "app/views/**/*.erb", "-o", "app.css");

    expect(await readOutput()).toContain(".theme-dark");
  });

  it("writes the complete stylesheet when the templates name every class", async () => {
    const complete = await readFile(path.join(packageRoot, "dist", "index.css"), "utf8");
    const names = [...complete.matchAll(/\.([a-z][\w-]*)/g)].map(([, name]) => name);

    await writeFile(path.join(project, "app", "views", "all.html.erb"), [...new Set(names)].join(" "));
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

  it("rejects a build without --content", async () => {
    expect(await failureOf("build", "-o", "app.css")).toMatch(/--content/);
  });

  it("rejects a build without --output", async () => {
    expect(await failureOf("build", "-c", "app/views/**/*.erb")).toMatch(/--output/);
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

  it("rejects a --content glob that matches no file, naming it", async () => {
    expect(await failureOf("build", "-c", "app/view/**/*.erb", "-o", "app.css")).toMatch(/app\/view\/\*\*\/\*\.erb/);
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
    nodeVersion = "22.11.0";

    expect(await failureOf("build", "-c", "app/views/**/*.erb", "-o", "app.css")).toBe(
      "chs: this command needs Node.js 24 or newer; this is Node.js 22.11.0.",
    );
  });

  it("passes on Node.js's own failure to write the output", async () => {
    await mkdir(path.join(project, "app.css"));

    expect(await failureOf("build", "-c", "app/views/**/*.erb", "-o", "app.css")).toMatch(
      /^chs: cannot write the stylesheet: .*EISDIR/,
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
