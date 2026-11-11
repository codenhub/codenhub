import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { findPackageRoot, run } from "../../src/cli/run";

const { version } = createRequire(import.meta.url)("../../package.json") as { version: string };

// Each build test runs Tailwind's real CLI over this package's real `tw/` sources, which takes seconds, not milliseconds.
vi.setConfig({ testTimeout: 30_000 });

let root: string;
let project: string;
let scratch: string;
let stdout: string[];
let stderr: string[];
let missing: string[];
let nodeVersion: string;

const resolveFromHere = createRequire(import.meta.url).resolve;

/* Resolves as Node does, except for the packages a test says are not installed. */
function resolvePackage(specifier: string): string {
  if (missing.some((name) => specifier.startsWith(`${name}/`))) {
    throw Object.assign(new Error(`Cannot find module '${specifier}'`), { code: "MODULE_NOT_FOUND" });
  }

  return resolveFromHere(specifier);
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "codenhub-styles-cli-test-"));
  project = path.join(root, "project");
  scratch = path.join(root, "scratch");
  await mkdir(path.join(project, "app", "views"), { recursive: true });
  await mkdir(scratch);
  await writeFile(path.join(project, "app", "views", "show.html.erb"), '<button class="btn primary">Save</button>\n');
  stdout = [];
  stderr = [];
  missing = [];
  nodeVersion = process.versions.node;
});

afterEach(async () => {
  await rm(root, { force: true, recursive: true });
});

function build(...argv: string[]): Promise<number> {
  return run(argv, {
    cwd: project,
    tmpdir: scratch,
    nodeVersion,
    resolvePackage,
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

  it("builds the Tailwind utilities the templates use", async () => {
    await writeFile(path.join(project, "app", "views", "list.html.erb"), '<ul class="flex mt-4"></ul>\n');

    await build("build", "-c", "app/views/**/*.erb", "-o", "app.css");

    expect(await readOutput()).toMatch(ruleFor("flex"));
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

  it("removes its temporary directory after a build", async () => {
    await build("build", "-c", "app/views/**/*.erb", "-o", "app.css");

    expect(await readdir(scratch)).toEqual([]);
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

  it("names both Tailwind packages and their install command when neither is installed", async () => {
    missing = ["@tailwindcss/cli", "tailwindcss"];

    expect(await failureOf("build", "-c", "app/views/**/*.erb", "-o", "app.css")).toBe(
      "codenhub-styles: this command needs @tailwindcss/cli and tailwindcss, which are not installed. Run: npm install --save-dev @tailwindcss/cli tailwindcss",
    );
  });

  it("names only @tailwindcss/cli when tailwindcss is installed", async () => {
    missing = ["@tailwindcss/cli"];

    expect(await failureOf("build", "-c", "app/views/**/*.erb", "-o", "app.css")).toBe(
      "codenhub-styles: this command needs @tailwindcss/cli, which is not installed. Run: npm install --save-dev @tailwindcss/cli",
    );
  });

  it("names only tailwindcss when @tailwindcss/cli is installed", async () => {
    missing = ["tailwindcss"];

    expect(await failureOf("build", "-c", "app/views/**/*.erb", "-o", "app.css")).toBe(
      "codenhub-styles: this command needs tailwindcss, which is not installed. Run: npm install --save-dev tailwindcss",
    );
  });

  it("writes no output when a Tailwind package is missing", async () => {
    missing = ["@tailwindcss/cli"];

    await build("build", "-c", "app/views/**/*.erb", "-o", "out/app.css");

    expect(await readdir(project)).toEqual(["app"]);
    expect(await readdir(scratch)).toEqual([]);
  });

  it("passes on a resolution failure that is not a missing package", async () => {
    const broken = vi.fn(() => {
      throw Object.assign(new Error("permission denied, open 'package.json'"), { code: "EACCES" });
    });

    expect(
      await run(["build", "-c", "app/views/**/*.erb", "-o", "app.css"], {
        cwd: project,
        tmpdir: scratch,
        nodeVersion,
        resolvePackage: broken,
        stdout: (line) => stdout.push(line),
        stderr: (line) => stderr.push(line),
      }),
    ).toBe(1);
    expect(stderr).toEqual(["codenhub-styles: permission denied, open 'package.json'"]);
  });

  it("rejects a Node.js older than it supports, naming both versions", async () => {
    nodeVersion = "22.11.0";

    expect(await failureOf("build", "-c", "app/views/**/*.erb", "-o", "app.css")).toBe(
      "codenhub-styles: this command needs Node.js 24 or newer; this is Node.js 22.11.0.",
    );
  });

  it("passes Tailwind's own failure through", async () => {
    await mkdir(path.join(project, "app.css"));

    expect(await failureOf("build", "-c", "app/views/**/*.erb", "-o", "app.css")).toMatch(/Tailwind.*EISDIR/);
  });

  it("removes its temporary directory after Tailwind fails", async () => {
    await mkdir(path.join(project, "app.css"));

    await build("build", "-c", "app/views/**/*.erb", "-o", "app.css");

    expect(await readdir(scratch)).toEqual([]);
  });
});

describe("help and version", () => {
  it("prints usage with --help and exits 0", async () => {
    expect(await build("--help")).toBe(0);
    expect(stdout.join("\n")).toMatch(/codenhub-styles build --content <glob>/);
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
