import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

import postcss from "postcss";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import type { IconFamilyData } from "../../src/core/types.js";
import { postcssIcons, type PostcssIconsOptions } from "../../src/postcss/plugin.js";

const { version } = createRequire(import.meta.url)("../../package.json") as { version: string };
const packageRoot = path.resolve(import.meta.dirname, "../..");

let root: string;
let project: string;
let stdout: string[];
let stderr: string[];
let nodeVersion: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "chi-cli-test-"));
  project = path.join(root, "project");
  await mkdir(path.join(project, "src"), { recursive: true });
  await writeFile(
    path.join(project, "src", "index.html"),
    '<i class="ic-lucide-heart"></i> <i class="ic-phosphor-star ic-xs ic-anim-spin"></i>\n',
  );
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

async function failureOf(...argv: string[]): Promise<string> {
  expect(await build(...argv)).toBe(1);
  expect(stderr).toHaveLength(1);

  return stderr[0] ?? "";
}

function readOutput(name = "icons.css"): Promise<string> {
  return readFile(path.join(project, name), "utf8");
}

async function readFamily(prefix: string): Promise<IconFamilyData> {
  return JSON.parse(await readFile(path.join(packageRoot, "data", prefix, "icons.json"), "utf8")) as IconFamilyData;
}

// What the PostCSS plugin appends to an empty stylesheet, run from the project folder as a build tool would be.
async function appendedByPostcss(options: PostcssIconsOptions): Promise<string> {
  const previous = process.cwd();

  process.chdir(project);
  try {
    return (await postcss([postcssIcons(options)]).process("", { from: undefined })).css;
  } finally {
    process.chdir(previous);
  }
}

describe("build", () => {
  it.each<[string[], PostcssIconsOptions]>([
    [[], {}],
    [["--default-prefix", "lucide"], { defaultPrefix: "lucide" }],
    [["--stroke-width", "1.25"], { strokeWidth: 1.25 }],
    [["--no-base"], { injectBase: false }],
    [["--attribution", "off"], { attribution: "off" }],
  ])("writes what the PostCSS plugin appends for the same content and options %j", async (flags, options) => {
    await writeFile(
      path.join(project, "src", "app.tsx"),
      '<i className="ic-heart/1.5 ic-lucide-house ic-md ic-on-hover ic-simple-icons-github" />\n',
    );
    const families = await Promise.all(["lucide", "phosphor", "simple-icons"].map(readFamily));
    const content = "src/**/*.{html,tsx}";
    const familyFlags = ["--family", "lucide", "--family", "phosphor", "--family", "simple-icons"];

    expect(await build("build", "-c", content, "-o", "icons.css", ...familyFlags, ...flags)).toBe(0);
    expect(await readOutput()).toBe(await appendedByPostcss({ content: [content], families, ...options }));
  });

  it("writes the rules of the icons the files use, with their notices", async () => {
    expect(await build("build", "-c", "src/**/*.html", "-o", "icons.css")).toBe(0);

    const css = await readOutput();

    expect(css).toContain(".ic-lucide-heart");
    expect(css).toContain(".ic-phosphor-star");
    expect(css).not.toContain(".ic-lucide-house");
    expect(css).toMatch(/^\/\*!/);
    expect(css).toContain("Lucide");
  });

  it("reports the output path and its size in bytes", async () => {
    await build("build", "-c", "src/**/*.html", "-o", "icons.css");

    const { size } = await stat(path.join(project, "icons.css"));

    expect(stderr).toEqual([]);
    expect(stdout).toEqual([`${path.join(project, "icons.css")} ${size} bytes`]);
  });

  it("leaves brand families out unless named", async () => {
    await writeFile(path.join(project, "src", "index.html"), '<i class="ic-simple-icons-github"></i>\n');

    await build("build", "-c", "src/index.html", "-o", "default.css");
    await build("build", "-c", "src/index.html", "-o", "named.css", "--family", "simple-icons");

    expect(await readOutput("default.css")).not.toContain(".ic-simple-icons-github");
    expect(await readOutput("named.css")).toContain(".ic-simple-icons-github");
  });

  it("resolves a bare name through --default-prefix", async () => {
    await writeFile(path.join(project, "src", "index.html"), '<i class="ic-heart"></i>\n');

    await build("build", "-c", "src/index.html", "-o", "icons.css", "--default-prefix", "lucide");

    expect(await readOutput()).toContain(".ic-heart");
  });

  it("writes a stroke modifier's own width", async () => {
    await writeFile(path.join(project, "src", "index.html"), '<i class="ic-lucide-heart/1.5"></i>\n');

    await build("build", "-c", "src/index.html", "-o", "icons.css");

    expect(await readOutput()).toContain(String.raw`.ic-lucide-heart\/1\.5`);
    expect(await readOutput()).toContain("stroke-width=%221.5%22");
  });

  it("follows --prefix", async () => {
    await writeFile(path.join(project, "src", "index.html"), '<i class="ux-lucide-heart ic-lucide-house"></i>\n');

    await build("build", "-c", "src/index.html", "-o", "icons.css", "--prefix", "ux");

    const css = await readOutput();

    expect(css).toContain(".ux-lucide-heart");
    expect(css).not.toContain("lucide-house");
  });

  it("reads a --content path whose name holds a bracket as that file", async () => {
    await mkdir(path.join(project, "app", "[id]"), { recursive: true });
    await writeFile(path.join(project, "app", "[id]", "page.tsx"), '<i className="ic-lucide-house" />\n');

    expect(await build("build", "-c", "app/[id]/page.tsx", "-o", "icons.css")).toBe(0);
    expect(await readOutput()).toContain(".ic-lucide-house");
  });

  it("creates the output's parent directories", async () => {
    expect(await build("build", "-c", "src/**/*.html", "-o", "public/css/icons.css")).toBe(0);
    expect(await readOutput("public/css/icons.css")).toContain(".ic-lucide-heart");
  });

  it("does not read its previous output when --content matches it", async () => {
    expect(await build("build", "-c", "**/*.{html,css}", "-o", "public/icons.css")).toBe(0);
    await writeFile(path.join(project, "src", "index.html"), '<i class="ic-lucide-star"></i>\n');
    stderr = [];

    expect(await build("build", "-c", "**/*.{html,css}", "-o", "public/icons.css")).toBe(0);
    expect(stderr).toEqual([]);
    expect(await readOutput("public/icons.css")).not.toContain(".ic-lucide-heart");
  });

  it("warns once on the classes that resolve to no icon, and still writes", async () => {
    await writeFile(
      path.join(project, "src", "index.html"),
      '<i class="ic-lucide-hart ic-lucide-heart ic-nothing-here ic-xl ic-trigger ic-anim-pulse"></i>\n',
    );

    expect(await build("build", "-c", "src/index.html", "-o", "icons.css")).toBe(0);
    expect(stderr).toEqual(["chi: warning: these 2 classes resolve to no icon: ic-lucide-hart, ic-nothing-here."]);
    expect(await readOutput()).toContain(".ic-lucide-heart");
  });

  it("warns when --attribution off drops a notice a family requires", async () => {
    expect(await build("build", "-c", "src/**/*.html", "-o", "icons.css", "--attribution", "off")).toBe(0);

    expect(stderr).toEqual([expect.stringMatching(/^chi: warning: Icon attribution is disabled/)]);
    expect(await readOutput()).not.toMatch(/^\/\*!/);
  });

  it("builds importing only Node.js built-ins and its own family data", async () => {
    const bundle = await readFile(path.join(packageRoot, "dist", "cli.js"), "utf8");
    const imports = bundle.split("\n").filter((line) => line.startsWith("import "));

    expect(imports.length).toBeGreaterThan(0);
    expect(imports.filter((line) => !/ from "node:[\w/]+";$/.test(line))).toEqual([]);
    expect(bundle).not.toMatch(/\brequire\(/);
    // The one dynamic import loads a family module of this package's own `dist/data/`.
    expect(bundle.match(/\bimport\(/g)).toHaveLength(1);
    expect(bundle).toContain('"dist/data"');
  });
});

describe("failures", () => {
  it("rejects a build without --content", async () => {
    expect(await failureOf("build", "-o", "icons.css")).toMatch(/^chi: missing --content/);
  });

  it("rejects a build without --output", async () => {
    expect(await failureOf("build", "-c", "src/**/*.html", "-o", "  ")).toMatch(/^chi: missing --output/);
  });

  it("rejects a --content glob that matches no file, naming it and the folder", async () => {
    expect(await failureOf("build", "-c", "source/**/*.html", "-o", "icons.css")).toBe(
      `chi: --content "source/**/*.html" matches no file in ${project}; check the path, or run from the project root.`,
    );
  });

  it("rejects extra arguments, which an unquoted glob expanded by the shell produces", async () => {
    expect(await failureOf("build", "-c", "src/a.html", "src/b.html", "-o", "icons.css")).toMatch(
      /src\/b\.html.*quote/,
    );
  });

  it("rejects an unknown flag by name", async () => {
    expect(await failureOf("build", "--minify")).toBe(
      'chi: unknown option "--minify"; run "chi --help" for the options.',
    );
  });

  it("rejects a flag given without its value", async () => {
    expect(await failureOf("build", "-c", "src/**/*.html", "-o")).toMatch(
      /^chi: option "--output" is missing its value/,
    );
  });

  it("rejects an unknown family and lists the valid ones", async () => {
    expect(await failureOf("build", "-c", "src/**/*.html", "-o", "icons.css", "--family", "lucid")).toMatch(
      /^chi: unknown family "lucid"; choose from .*\blucide\b.*\bphosphor\b/,
    );
  });

  it("rejects a default prefix outside the families it resolves", async () => {
    expect(
      await failureOf(
        "build",
        "-c",
        "src/**/*.html",
        "-o",
        "icons.css",
        "--family",
        "lucide",
        "--default-prefix",
        "phosphor",
      ),
    ).toBe('chi: unknown default prefix "phosphor"; choose from lucide.');
  });

  it("rejects a brand default prefix unless its family is named", async () => {
    expect(
      await failureOf("build", "-c", "src/**/*.html", "-o", "icons.css", "--default-prefix", "simple-icons"),
    ).toMatch(/^chi: default prefix "simple-icons" is a brand family.*--family simple-icons/);
  });

  it("rejects an --attribution it does not know", async () => {
    expect(await failureOf("build", "-c", "src/**/*.html", "-o", "icons.css", "--attribution", "file")).toBe(
      'chi: unknown --attribution "file"; choose auto or off.',
    );
  });

  it.each(["0", "-1", "wide", ""])("rejects a --stroke-width of %j", async (width) => {
    expect(await failureOf("build", "-c", "src/**/*.html", "-o", "icons.css", `--stroke-width=${width}`)).toMatch(
      /^chi: --stroke-width ".*" is not a positive number/,
    );
  });

  it("rejects a missing command", async () => {
    expect(await failureOf("-c", "src/**/*.html", "-o", "icons.css")).toMatch(/build/);
  });

  it("rejects an unknown command", async () => {
    expect(await failureOf("watch", "-c", "src/**/*.html", "-o", "icons.css")).toMatch(/"watch"/);
  });

  it("rejects a Node.js older than it supports, naming both versions", async () => {
    nodeVersion = "24.22.1";

    expect(await failureOf("build", "-c", "src/**/*.html", "-o", "icons.css")).toBe(
      "chi: this command needs Node.js 26 or newer; this is Node.js 24.22.1.",
    );
  });

  it("passes on Node.js's own failure to write the output", async () => {
    await mkdir(path.join(project, "icons.css"));

    expect(await failureOf("build", "-c", "src/**/*.html", "-o", "icons.css")).toMatch(
      /^chi: cannot write the stylesheet: .*(EISDIR|EPERM)/,
    );
  });

  // The temporary file is the one write that can fail partway; a directory in its place makes it fail.
  it("leaves the previous stylesheet whole when the write fails", async () => {
    await writeFile(path.join(project, "icons.css"), "/* previous */");
    await mkdir(path.join(project, `icons.css.${process.pid}.tmp`));

    expect(await failureOf("build", "-c", "src/**/*.html", "-o", "icons.css")).toMatch(
      /^chi: cannot write the stylesheet: /,
    );
    expect(await readFile(path.join(project, "icons.css"), "utf8")).toBe("/* previous */");
  });
});

describe("help and version", () => {
  it("prints usage with --help and exits 0", async () => {
    expect(await build("--help")).toBe(0);
    expect(stdout.join("\n")).toMatch(/chi build --content <glob>/);
    expect(stdout.join("\n")).toMatch(/Families: .*\blucide\b/);
    expect(stderr).toEqual([]);
  });

  it("prints the package version with --version and exits 0", async () => {
    expect(await build("--version")).toBe(0);
    expect(stdout).toEqual([version]);
  });
});
