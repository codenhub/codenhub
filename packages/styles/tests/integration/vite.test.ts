import { realpathSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import type * as Vite from "vite";
import type { InlineConfig, Logger, Plugin, ViteDevServer } from "vite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { run } from "../../src/cli/run";
import { readAestheticNames } from "../../src/trim";
import viteStyles, { type ViteStylesOptions } from "../../src/vite";

/* CI runs this suite against other Vite releases installed under this name,
   since Vitest needs a Vite of its own (`.github/workflows/vite.yml`). */
const vite = (await import(process.env.VITE_UNDER_TEST ?? "vite")) as typeof Vite;
const viteMajor = Number.parseInt(vite.version, 10);
const viteMinor = Number.parseInt(vite.version.split(".")[1], 10);
const packageRoot = path.resolve(import.meta.dirname, "../..");
// Windows links a file only with Developer Mode on or as an administrator.
const canLinkFiles = await probeFileLinks();

let project: string;

beforeEach(async () => {
  // As the system resolves it, so a Windows 8.3 short name in the temporary folder does not differ from what Vite reports.
  project = realpathSync.native(await mkdtemp(path.join(tmpdir(), "styles-vite-")));
  await writeFiles({ "package.json": `{ "name": "fixture", "private": true, "type": "module" }\n` });
  await linkPackage("@codenhub/styles", packageRoot);
});

afterEach(async () => {
  await rm(project, { recursive: true, force: true, maxRetries: 5 });
});

/* The chokidar 3 that Vite 5 and 6 bundle drops a change to a file within
   50 ms of its last one and never reports it, so a test that writes a file
   twice in a row waits that long. Seen on Linux in about 1 run in 50. */
const WATCHER_THROTTLE = 60;
const lastWrites = new Map<string, number>();

async function writeFiles(files: Record<string, string>): Promise<void> {
  await Promise.all(
    Object.entries(files).map(async ([name, text]) => {
      const file = path.join(project, name);
      const wait = (lastWrites.get(file) ?? -Infinity) + WATCHER_THROTTLE - performance.now();

      if (wait > 0) {
        await delay(wait);
      }
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, text);
      lastWrites.set(file, performance.now());
    }),
  );
}

async function probeFileLinks(): Promise<boolean> {
  const folder = await mkdtemp(path.join(tmpdir(), "styles-vite-link-"));

  try {
    await writeFile(path.join(folder, "target"), "");
    await symlink(path.join(folder, "target"), path.join(folder, "link"), "file");

    return true;
  } catch (error) {
    if ((error as { code?: string }).code !== "EPERM") {
      throw error;
    }

    return false;
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

async function linkPackage(name: string, target: string): Promise<void> {
  const link = path.join(project, "node_modules", name);

  await mkdir(path.dirname(link), { recursive: true });
  await symlink(target, link, "junction");
}

// The CSS a production build emits, every file of it in name order.
async function build(options?: ViteStylesOptions, config: InlineConfig = {}): Promise<string> {
  await vite.build({ root: project, configFile: false, logLevel: "silent", plugins: [viteStyles(options)], ...config });

  return readCss(path.join(project, config.build?.outDir ?? "dist"));
}

// A module's exports, loaded through a dev server the way server-side rendering loads them.
async function loadInDev(
  url: string,
  options?: ViteStylesOptions,
  config: InlineConfig = {},
): Promise<Record<string, string>> {
  const server = await vite.createServer({
    root: project,
    configFile: false,
    logLevel: "silent",
    appType: "custom",
    server: { middlewareMode: true, watch: null },
    plugins: [viteStyles(options)],
    ...config,
  });

  try {
    return (await server.ssrLoadModule(url)) as Record<string, string>;
  } finally {
    await server.close();
  }
}

// What `chs build` writes for the same project, read back.
async function chsBuild(...args: string[]): Promise<string> {
  const output = path.join(project, "out", "chs.css");
  const errors: string[] = [];
  const code = await run(["build", ...args, "--output", output], {
    cwd: project,
    nodeVersion: process.versions.node,
    stdout: () => undefined,
    stderr: (line) => errors.push(line),
  });

  expect(errors).toEqual([]);
  expect(code).toBe(0);

  return readFile(output, "utf8");
}

function collectingLogger(warnings: string[]): Logger {
  const logger = vite.createLogger("silent");

  return {
    ...logger,
    warn: (message) => warnings.push(message),
    warnOnce: (message) => warnings.push(message),
  };
}

async function readCss(folder: string): Promise<string> {
  const files = (await readdir(folder, { recursive: true })).filter((name) => name.endsWith(".css")).sort();

  return (await Promise.all(files.map((name) => readFile(path.join(folder, name), "utf8")))).join("");
}

function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/* A rule only a page naming the class keeps: an unused class still appears in
   the selector lists a used one shares, as `.alert,.data-table` does. */
function hasRuleFor(css: string, name: string): boolean {
  return css.includes(`.${name}{`);
}

const PAGE = (body: string, script = "/main.js") =>
  `<!doctype html><html><head><script type="module" src="${script}"></script></head><body>${body}</body></html>\n`;

describe("viteStyles: build", () => {
  it("trims the stylesheet a script imports to the classes the project's files name", async () => {
    await writeFiles({
      "index.html": PAGE(`<button class="btn primary">Save</button>`),
      "main.js": `import "@codenhub/styles";\n`,
    });

    const css = await build();

    expect(hasRuleFor(css, "btn")).toBe(true);
    expect(hasRuleFor(css, "alert")).toBe(false);
  });

  it.each([
    ["a stylesheet", { "main.js": `import "./app.css";\n`, "app.css": `@import "@codenhub/styles";\n` }],
    [
      "a stylesheet a stylesheet imports",
      {
        "main.js": `import "./app.css";\n`,
        "app.css": `@import "./styles/base.css";\n`,
        "styles/base.css": `@import "@codenhub/styles";\n`,
      },
    ],
    ["a Sass @use", { "main.js": `import "./app.scss";\n`, "app.scss": `@use "@codenhub/styles";\n` }],
    ["a Sass @import", { "main.js": `import "./app.scss";\n`, "app.scss": `@import "@codenhub/styles";\n` }],
  ])("trims the stylesheet %s imports", async (_route, files) => {
    await linkPackage("sass", path.join(packageRoot, "node_modules", "sass"));
    await writeFiles({ "index.html": PAGE(`<button class="btn primary">Save</button>`), ...files });

    const css = await build();

    expect(hasRuleFor(css, "btn")).toBe(true);
    expect(hasRuleFor(css, "alert")).toBe(false);
  });

  // A limit, held so a change to it is seen: Sass resolves `pkg:` itself and never asks Vite. Vite 5 uses Sass's legacy API, which has no `pkg:`.
  it.skipIf(viteMajor < 6)("leaves whole the stylesheet a Sass pkg: URL imports", async () => {
    const sass = await import("sass");

    await linkPackage("sass", path.join(packageRoot, "node_modules", "sass"));
    await writeFiles({
      "index.html": PAGE(`<button class="btn primary">Save</button>`),
      "main.js": `import "./app.scss";\n`,
      "app.scss": `@use "pkg:@codenhub/styles";\n`,
    });

    const css = await build(undefined, {
      css: { preprocessorOptions: { scss: { importers: [new sass.NodePackageImporter(project)] } } },
    });

    expect(hasRuleFor(css, "alert")).toBe(true);
  });

  it("trims the stylesheet a ?url import emits", async () => {
    await writeFiles({
      "index.html": PAGE(`<button class="btn primary">Save</button>`),
      "main.js": `import href from "@codenhub/styles?url";\ndocument.head.append(Object.assign(document.createElement("link"), { rel: "stylesheet", href }));\n`,
    });

    const css = await build();

    expect(hasRuleFor(css, "btn")).toBe(true);
    expect(hasRuleFor(css, "alert")).toBe(false);
  });

  it("trims through Lightning CSS when it is Vite's CSS transformer", async () => {
    await linkPackage("lightningcss", path.join(packageRoot, "node_modules", "lightningcss"));
    await writeFiles({
      "index.html": PAGE(`<button class="btn primary">Save</button>`),
      "main.js": `import "./app.css";\nimport "@codenhub/styles";\n`,
      "app.css": `@import "@codenhub/styles";\n`,
    });

    const css = await build({}, { css: { transformer: "lightningcss" } });

    expect(hasRuleFor(css, "btn")).toBe(true);
    expect(hasRuleFor(css, "alert")).toBe(false);
  });

  it.each(["components", "native", "theme", "palette"])("leaves the %s stylesheet whole", async (name) => {
    await writeFiles({
      "index.html": PAGE(`<button class="btn primary">Save</button>`),
      "entry.js": `export { default } from "@codenhub/styles/${name}?raw";\n`,
    });

    const { default: css } = await loadInDev("/entry.js");

    expect(css).toBe(await readFile(path.join(packageRoot, "dist", `${name}.css`), "utf8"));
  });

  it("trims the stylesheet a server-side rendering build inlines", async () => {
    await writeFiles({
      "index.html": PAGE(`<button class="btn primary">Save</button>`),
      "entry.js": `export { default } from "@codenhub/styles?inline";\n`,
    });

    await vite.build({
      root: project,
      configFile: false,
      logLevel: "silent",
      plugins: [viteStyles()],
      build: { ssr: "entry.js", outDir: "dist-ssr" },
    });

    const bundle = await readFile(path.join(project, "dist-ssr", "entry.js"), "utf8");

    expect(hasRuleFor(bundle, "btn")).toBe(true);
    expect(hasRuleFor(bundle, "alert")).toBe(false);
  });

  it("trims the stylesheet of every aesthetic", async () => {
    await writeFiles({
      "index.html": PAGE(`<p>No StyleKit class here.</p>`),
      "entry.js": `export { default } from "@codenhub/styles/aesthetics?raw";\n`,
    });

    const { default: css } = await loadInDev("/entry.js");
    const full = await readFile(path.join(packageRoot, "dist/aesthetics/index.css"), "utf8");

    expect(css.length).toBeGreaterThan(0);
    expect(css.length).toBeLessThan(full.length);
  });
});

describe("viteStyles: which files are read", () => {
  const BUTTON_PAGE = {
    "index.html": PAGE(`<button class="btn primary">Save</button>`),
    "main.js": `import "@codenhub/styles";\n`,
  };

  it("reads every file under the root, in any folder", async () => {
    await writeFiles({ ...BUTTON_PAGE, "src/deep/er/note.txt": "alert\n" });

    expect(hasRuleFor(await build(), "alert")).toBe(true);
  });

  it("leaves out an earlier build's output, which names the classes that build kept", async () => {
    await writeFiles({ ...BUTTON_PAGE, "dist/assets/old.js": `const a = "alert";\n` });

    expect(hasRuleFor(await build(), "alert")).toBe(false);
  });

  it("leaves out an output folder named by build.outDir", async () => {
    await writeFiles({ ...BUTTON_PAGE, "www/old.js": `const a = "alert";\n` });

    expect(hasRuleFor(await build({}, { build: { outDir: "www" } }), "alert")).toBe(false);
  });

  it.runIf(viteMajor >= 6)("leaves out each environment's output folder", async () => {
    await writeFiles({ ...BUTTON_PAGE, "dist-ssr/old.js": `const a = "alert";\n` });

    const css = await build({}, { environments: { ssr: { build: { outDir: "dist-ssr" } } } });

    expect(hasRuleFor(css, "alert")).toBe(false);
  });

  it("leaves out Vite's cache folder, where it keeps generated code", async () => {
    await writeFiles({ ...BUTTON_PAGE, "cache/deps/chunk.js": `const a = "alert";\n` });

    expect(hasRuleFor(await build({}, { cacheDir: "cache" }), "alert")).toBe(false);
  });

  it("leaves out stylesheets, where a property value such as solid is a word too", async () => {
    await writeFiles({
      "index.html": PAGE(`<button class="btn primary">Save</button>`),
      "main.js": `import "./app.css";\n`,
      "app.css": `@import "@codenhub/styles";\n.note { border: 1px solid; }\n`,
      "theme.scss": `.x { border: 1px solid; }\n`,
    });
    await linkPackage("sass", path.join(packageRoot, "node_modules", "sass"));

    expect(hasRuleFor(await build(), "solid")).toBe(false);
  });

  it("leaves out a binary file, and reads a UTF-16 one", async () => {
    await writeFiles(BUTTON_PAGE);
    await writeFile(
      path.join(project, "photo.png"),
      Buffer.concat([Buffer.from([0x89, 0, 0, 0]), Buffer.from(" alert ")]),
    );
    await writeFile(
      path.join(project, "notes.txt"),
      Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(" card ", "utf16le")]),
    );
    await writeFile(
      path.join(project, "big-endian.txt"),
      Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(" badge ", "utf16le").swap16()]),
    );

    const css = await build();

    expect(hasRuleFor(css, "alert")).toBe(false);
    expect(hasRuleFor(css, "card")).toBe(true);
    expect(hasRuleFor(css, "badge")).toBe(true);
  });

  it("reads a file whose name a glob would read as a pattern, as route files have", async () => {
    await writeFiles({
      ...BUTTON_PAGE,
      "src/routes/[slug].vue": `<template><div class="alert"></div></template>\n`,
      "src/routes/(group)/+page.svelte": `<div class="card"></div>\n`,
      "src/routes/{a,b}.astro": `<div class="badge"></div>\n`,
    });

    const css = await build();

    expect(hasRuleFor(css, "alert")).toBe(true);
    expect(hasRuleFor(css, "card")).toBe(true);
    expect(hasRuleFor(css, "badge")).toBe(true);
  });

  it("leaves out what .gitignore excludes", async () => {
    await writeFiles({
      ...BUTTON_PAGE,
      ".gitignore": "coverage/\n",
      "coverage/index.html": `<div class="alert"></div>\n`,
    });

    expect(hasRuleFor(await build(), "alert")).toBe(false);
  });

  it("does not follow a link to a folder", async () => {
    const outside = await mkdtemp(path.join(tmpdir(), "styles-vite-outside-"));

    try {
      await writeFile(path.join(outside, "note.txt"), "alert\n");
      await writeFiles(BUTTON_PAGE);
      await symlink(outside, path.join(project, "linked"), "junction");

      expect(hasRuleFor(await build(), "alert")).toBe(false);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it.skipIf(!canLinkFiles)("reads a file a link points to", async () => {
    const outside = await mkdtemp(path.join(tmpdir(), "styles-vite-outside-"));

    try {
      await writeFile(path.join(outside, "note.txt"), "alert\n");
      await writeFiles(BUTTON_PAGE);
      await symlink(path.join(outside, "note.txt"), path.join(project, "note.txt"), "file");

      expect(hasRuleFor(await build(), "alert")).toBe(true);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  // Windows grants an administrator every folder, and so does Unix its root user.
  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "fails naming a folder it cannot read, and how to fix it",
    async () => {
      await writeFiles({ ...BUTTON_PAGE, "locked/note.txt": "alert\n" });
      await chmod(path.join(project, "locked"), 0o000);

      try {
        await expect(build()).rejects.toThrow(
          `@codenhub/styles/vite: cannot read "${path.join(project, "locked")}" (EACCES); fix its permissions or add it to .gitignore.`,
        );
      } finally {
        await chmod(path.join(project, "locked"), 0o700);
      }
    },
  );

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "fails naming a .gitignore it cannot read, and how to fix it",
    async () => {
      await writeFiles({ ...BUTTON_PAGE, "src/.gitignore": "*.log\n" });
      await chmod(path.join(project, "src", ".gitignore"), 0o000);

      await expect(build()).rejects.toThrow(
        `@codenhub/styles/vite: cannot read "${path.join(project, "src", ".gitignore")}" (EACCES); fix its permissions or remove it.`,
      );
    },
  );

  it("leaves out a copy of the package's class list", async () => {
    await writeFiles({
      ...BUTTON_PAGE,
      "public/classes.json": await readFile(path.join(packageRoot, "dist/purge/classes.json"), "utf8"),
    });

    expect(hasRuleFor(await build(), "alert")).toBe(false);
  });

  it("keeps the base of a project that names no StyleKit class, with no warning", async () => {
    await writeFiles({ "index.html": PAGE(`<p>Hello</p>`), "main.js": `import "@codenhub/styles";\n` });
    const warnings: string[] = [];

    const css = await build({}, { customLogger: collectingLogger(warnings) });

    expect(css.length).toBeGreaterThan(0);
    expect(hasRuleFor(css, "btn")).toBe(false);
    expect(warnings).toEqual([]);
  });
});

describe("viteStyles: content", () => {
  const BUTTON_PAGE = {
    "index.html": PAGE(`<button class="btn primary">Save</button>`),
    "main.js": `import "@codenhub/styles";\n`,
  };
  let outside: string;

  beforeEach(async () => {
    outside = realpathSync.native(await mkdtemp(path.join(tmpdir(), "styles-vite-shared-")));
  });

  afterEach(async () => {
    await rm(outside, { recursive: true, force: true });
  });

  // An entry for a file in the folder outside the root, relative to the root as a project writes it.
  function shared(name: string): string {
    return path.relative(project, path.join(outside, name)).split(path.sep).join("/");
  }

  it("reads the files outside the root an entry names, relative to the root", async () => {
    await writeFiles(BUTTON_PAGE);
    await mkdir(path.join(outside, "cards"));
    await writeFile(path.join(outside, "cards", "card.html"), `<div class="card"></div>\n`);

    const css = await build({ content: [shared("**/*.html")] });

    expect(hasRuleFor(css, "card")).toBe(true);
    expect(hasRuleFor(css, "alert")).toBe(false);
  });

  it("reads an entry from the root as Vite names it, when Vite keeps the link that names it", async () => {
    // The project is in project/app, and Vite is given a link to it in the other folder. Each has a shared folder beside it.
    const root = path.join(outside, "app");
    const modules = path.join(project, "app", "node_modules", "@codenhub");

    await writeFiles({ "app/index.html": BUTTON_PAGE["index.html"], "app/main.js": BUTTON_PAGE["main.js"] });
    await writeFiles({ "shared/card.txt": "alert\n" });
    await mkdir(modules, { recursive: true });
    await symlink(packageRoot, path.join(modules, "styles"), "junction");
    await symlink(path.join(project, "app"), root, "junction");
    await mkdir(path.join(outside, "shared"));
    await writeFile(path.join(outside, "shared", "card.txt"), "card\n");
    // Vite 8 and newer resolve the root to its real path unless told to keep links.
    await vite.build({
      root,
      configFile: false,
      logLevel: "silent",
      resolve: { preserveSymlinks: true },
      plugins: [viteStyles({ content: ["../shared/*.txt"] })],
    });

    const css = await readCss(path.join(project, "app", "dist"));

    // `../shared` is read beside the link, as Vite reads `build.outDir: "../out"`, not beside the folder it links to.
    expect(hasRuleFor(css, "card")).toBe(true);
    expect(hasRuleFor(css, "alert")).toBe(false);
  });

  it("reads a file an entry names even where .gitignore leaves it out", async () => {
    await writeFiles({ ...BUTTON_PAGE, ".gitignore": "generated/\n", "generated/classes.txt": "alert\n" });

    expect(hasRuleFor(await build({ content: ["generated/classes.txt"] }), "alert")).toBe(true);
  });

  it("leaves out a copy of the package's class list an entry names", async () => {
    await writeFiles(BUTTON_PAGE);
    await writeFile(
      path.join(outside, "classes.json"),
      await readFile(path.join(packageRoot, "dist/purge/classes.json")),
    );

    expect(hasRuleFor(await build({ content: [shared("classes.json")] }), "alert")).toBe(false);
  });

  it("fails naming an entry that matches no file, and the root it was read from", async () => {
    await writeFiles(BUTTON_PAGE);

    await expect(build({ content: ["templates/**/*.html"] })).rejects.toThrow(
      `@codenhub/styles/vite: content "templates/**/*.html" matches no file in ${project}; check the path, which is read from the Vite root.`,
    );
  });

  it("fails naming an entry that is a folder, with the glob that reads it", async () => {
    await writeFiles(BUTTON_PAGE);

    await expect(build({ content: [shared("")] })).rejects.toThrow(
      `@codenhub/styles/vite: content "${shared("")}" is a folder in ${project}, not a file; name the files in it, as in "${shared("")}/**/*".`,
    );
  });

  it.each([
    ["a string", "src/**/*.html"],
    ["an array holding a number", [1]],
    ["null", null],
  ])("fails for a content that is %s, when the configuration calls it", (_case, content) => {
    expect(() => viteStyles({ content } as unknown as ViteStylesOptions)).toThrow(
      `@codenhub/styles/vite: content must be an array of paths or globs, as in content: ["../shared/**/*.html"].`,
    );
  });

  it.each([[""], ["  "]])("fails for a content entry of %j", (entry) => {
    expect(() => viteStyles({ content: ["src/*.html", entry] })).toThrow(
      `@codenhub/styles/vite: content holds an empty entry; remove it or name a path or glob.`,
    );
  });
});

describe("viteStyles: the trimmed files", () => {
  async function trimmedFiles(): Promise<string[]> {
    const folder = path.join(project, "node_modules", ".vite", "codenhub-styles");
    const names = await readdir(folder, { recursive: true });

    return names.filter((name) => name.endsWith(".css")).map((name) => path.join(folder, name));
  }

  it("writes each one again only when its bytes change", async () => {
    await writeFiles({
      "index.html": PAGE(`<button class="btn primary">Save</button>`),
      "main.js": `import "@codenhub/styles";\n`,
    });
    await build();

    const files = await trimmedFiles();
    const past = new Date("2020-01-01T00:00:00Z");

    expect(files.length).toBeGreaterThan(0);
    await Promise.all(files.map((file) => utimes(file, past, past)));
    await build();

    const times = await Promise.all(files.map(async (file) => (await stat(file)).mtime));

    expect(times).toEqual(files.map(() => past));
  });

  it("keeps them in Vite's cache folder for a project without package.json", async () => {
    await rm(path.join(project, "package.json"));
    await writeFiles({ "index.html": PAGE(`<p>Hello</p>`), "main.js": `import "@codenhub/styles";\n` });
    await build();

    const { cacheDir } = await vite.resolveConfig({ root: project, configFile: false, logLevel: "silent" }, "build");

    expect((await readdir(path.join(cacheDir, "codenhub-styles"), { recursive: true })).length).toBeGreaterThan(0);
  });

  it("leaves no temporary file beside them", async () => {
    await writeFiles({ "index.html": PAGE(`<p>Hello</p>`), "main.js": `import "@codenhub/styles";\n` });
    await build();

    const folder = path.join(project, "node_modules", ".vite", "codenhub-styles");

    expect((await readdir(folder, { recursive: true })).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("fails naming the folder it cannot write them to, and how to fix it", async () => {
    await writeFiles({
      "index.html": PAGE(`<p>Hello</p>`),
      "main.js": `import "@codenhub/styles";\n`,
      blocker: "a file",
    });

    await expect(build({}, { cacheDir: "blocker/cache" })).rejects.toThrow(
      new RegExp(
        String.raw`^@codenhub/styles/vite: cannot write to "${escapeRegExp(path.join(project, "blocker", "cache", "codenhub-styles"))}[^"]*": [^()]+ \(E[A-Z]+\); fix that, or set cacheDir to a folder you can write to\.$`,
      ),
    );
  });
});

describe("viteStyles: vite preview", () => {
  // Vite 5.0 does not tell a plugin it is a preview; 5.1 passes `isPreview`.
  it.skipIf(viteMajor === 5 && viteMinor < 1)(
    "starts without reading the project or writing a file, since it serves a finished build",
    async () => {
      await writeFiles({
        "index.html": PAGE(`<button class="btn primary">Save</button>`),
        "main.js": `import "@codenhub/styles";
`,
        blocker: "a file",
      });
      await vite.build({ root: project, configFile: false, logLevel: "silent" });

      // A content entry that matches nothing and a cache folder it cannot write to each fail a start that reads the project.
      const server = await vite.preview({
        root: project,
        configFile: false,
        logLevel: "silent",
        cacheDir: "blocker/cache",
        preview: { port: 0, open: false },
        plugins: [viteStyles({ content: ["templates/**/*.html"] })],
      });

      expect(server.resolvedUrls?.local.length).toBeGreaterThan(0);
      await new Promise<void>((resolve, reject) => {
        server.httpServer.close((error) => (error ? reject(error) : resolve()));
      });
    },
  );
});

describe("viteStyles: Node.js", () => {
  it("fails naming both versions on a Node.js older than 24, when the configuration calls it", () => {
    const actual = Object.getOwnPropertyDescriptor(process.versions, "node") as PropertyDescriptor;

    Object.defineProperty(process.versions, "node", { ...actual, value: "22.12.0" });
    try {
      expect(() => viteStyles()).toThrow(
        "@codenhub/styles/vite: this plugin needs Node.js 24 or newer; this is Node.js 22.12.0.",
      );
    } finally {
      Object.defineProperty(process.versions, "node", actual);
    }
  });
});

describe("viteStyles: a project's own alias", () => {
  const VENDORED = {
    "index.html": PAGE(`<button class="btn primary">Save</button>`),
    "main.js": `import "@codenhub/styles";\n`,
    "vendor/styles.css": `.vendored{color:red}\n`,
  };

  function warningFor(name: string): string {
    return `@codenhub/styles/vite: resolve.alias already maps "${name}", so that import keeps your alias and is not trimmed; remove the alias to trim it.`;
  }

  it("keeps the project's alias for an import, and warns once naming it", async () => {
    await writeFiles(VENDORED);
    const warnings: string[] = [];

    const css = await build(
      {},
      {
        customLogger: collectingLogger(warnings),
        resolve: { alias: [{ find: /^@codenhub\/styles$/, replacement: path.join(project, "vendor/styles.css") }] },
      },
    );

    expect(css).toContain(".vendored{");
    expect(warnings).toEqual([warningFor("@codenhub/styles")]);
  });

  it("warns once for an alias that maps the package and every path below it", async () => {
    await writeFiles(VENDORED);
    const warnings: string[] = [];

    const css = await build(
      {},
      {
        customLogger: collectingLogger(warnings),
        resolve: { alias: { "@codenhub/styles": path.join(project, "vendor/styles.css") } },
      },
    );

    expect(css).toContain(".vendored{");
    expect(warnings).toEqual([warningFor("@codenhub/styles")]);
  });

  it("still trims an import the project's alias does not map", async () => {
    await writeFiles({
      "index.html": PAGE(`<p>No StyleKit class here.</p>`),
      "entry.js": `export { default } from "@codenhub/styles/aesthetics?raw";\n`,
    });

    const { default: css } = await loadInDev(
      "/entry.js",
      {},
      {
        customLogger: collectingLogger([]),
        resolve: { alias: [{ find: /^@codenhub\/styles$/, replacement: path.join(project, "vendor/styles.css") }] },
      },
    );
    const full = await readFile(path.join(packageRoot, "dist/aesthetics/index.css"), "utf8");

    expect(css.length).toBeLessThan(full.length);
  });

  it("maps no import a project alias for a longer name would", async () => {
    await writeFiles({ ...VENDORED, "main.js": `import "@codenhub/styles";\nimport "@codenhub/styles-extra";\n` });
    await writeFiles({ "vendor/extra.css": `.extra{color:blue}\n` });
    const warnings: string[] = [];

    const css = await build(
      {},
      {
        customLogger: collectingLogger(warnings),
        resolve: { alias: { "@codenhub/styles-extra": path.join(project, "vendor/extra.css") } },
      },
    );

    expect(css).toContain(".extra{");
    expect(hasRuleFor(css, "btn")).toBe(true);
    expect(hasRuleFor(css, "alert")).toBe(false);
    expect(warnings).toEqual([]);
  });
});

// What a dev server sends its page over the WebSocket, as much of it as the tests read.
interface HotMessage {
  type: string;
  updates?: { type: string; path: string }[];
  err?: { message: string };
}

interface DevServer {
  server: ViteDevServer;
  // Every message the server sent the page, in order.
  messages: HotMessage[];
  // A module as the page fetches it, or a stylesheet as a <link> fetches it with `text/css`.
  fetch: (url: string, accept?: string) => Promise<string>;
  // A module and every module it imports, fetched as a page would, so the server knows the page uses them. The URLs fetched.
  load: (url: string) => Promise<string[]>;
  /* The first message after the `from`th that `test` accepts, waiting for it.
     A test that waits more than once names each wait, so a timeout says which. */
  waitFor: (test: (message: HotMessage) => boolean, from: number, what?: string) => Promise<HotMessage>;
  // Waits until the server's watcher reports a file written in the folder, so a change made next is not missed.
  watching: (folder: string) => Promise<void>;
}

const WAIT = { timeout: 10_000, interval: 50 };

// A dev server on a free port with a page connected to it, closed once `use` settles.
async function withDevServer(
  use: (dev: DevServer) => Promise<void>,
  options?: ViteStylesOptions,
  config: InlineConfig = {},
): Promise<void> {
  const server = await vite.createServer({
    root: project,
    configFile: false,
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0 },
    optimizeDeps: { noDiscovery: true },
    plugins: [viteStyles(options)],
    ...config,
  });
  let socket: WebSocket | undefined;

  try {
    await server.listen();

    const address = server.httpServer?.address();

    if (typeof address !== "object" || address === null) {
      throw new Error("the dev server listens on no port");
    }

    const { port } = address;
    const origin = `http://127.0.0.1:${port}`;
    // Vite 5.4.12 and newer refuse a page that does not send the token the page's client script holds.
    const token = (server.config as { webSocketToken?: string }).webSocketToken;
    const messages: HotMessage[] = [];

    socket = new WebSocket(`ws://127.0.0.1:${port}/${token === undefined ? "" : `?token=${token}`}`, "vite-hmr");
    socket.addEventListener("message", (event) => messages.push(JSON.parse(String(event.data)) as HotMessage));

    const fetchText = async (url: string, accept = "*/*"): Promise<string> => {
      const response = await fetch(`${origin}${url}`, { headers: { accept } });

      expect({ url, status: response.status }).toStrictEqual({ url, status: 200 });

      return response.text();
    };
    const load = async (url: string, seen = new Set<string>()): Promise<string[]> => {
      seen.add(url);

      const code = await fetchText(url);
      const imports = [...code.matchAll(/\b(?:from|import)\s*["'](\/[^"']+)["']/g)].map(([, found]) => found);

      await Promise.all(
        imports.filter((found) => !found.startsWith("/@vite/") && !seen.has(found)).map((found) => load(found, seen)),
      );

      return [...seen];
    };
    const waitFor = (test: (message: HotMessage) => boolean, from: number, what?: string): Promise<HotMessage> =>
      vi.waitFor(() => {
        const found = messages.slice(from).find(test);

        if (found === undefined) {
          const among = `among ${JSON.stringify(messages.slice(from))}`;

          throw new Error(what === undefined ? `no such message ${among}` : `no ${what} ${among}`);
        }

        return found;
      }, WAIT);
    const watching = async (folder: string): Promise<void> => {
      const probe = path.join(folder, "watcher-probe.txt");
      let isSeen = false;
      const onEvent = (file: string): void => {
        isSeen ||= path.resolve(file) === probe;
      };

      await mkdir(folder, { recursive: true });
      server.watcher.on("add", onEvent).on("change", onEvent);
      try {
        await vi.waitFor(async () => {
          if (!isSeen) {
            await writeFile(probe, `${Date.now()}\n`);
            throw new Error(`the watcher never reported ${probe}`);
          }
        }, WAIT);
      } finally {
        server.watcher.off("add", onEvent).off("change", onEvent);
      }
    };

    await waitFor((message) => message.type === "connected", 0);
    await watching(server.config.root);
    await use({ server, messages, fetch: fetchText, load, waitFor, watching });
  } finally {
    socket?.close();
    await server.close();
  }
}

// Whether the message updates the module at `url` in place, whatever query Vite adds, as the page's client matches it.
function updates(message: HotMessage, url: string): boolean {
  return message.type === "update" && message.updates?.some((update) => update.path.split("?")[0] === url) === true;
}

// A watcher can take seconds to report a change on a loaded machine.
describe("viteStyles: live update", { timeout: 40_000 }, () => {
  // A module that takes its own updates, as a framework's component does, so a change to it updates in place.
  const VIEW = (markup: string) => `export const view = ${JSON.stringify(markup)};\nimport.meta.hot?.accept();\n`;
  const SCRIPT_PAGE = {
    "index.html": PAGE(`<p>Hello</p>`),
    "main.js": `import "@codenhub/styles";\nimport "./view.js";\n`,
    "view.js": VIEW(`<p>Hi</p>`),
  };
  const BUTTON = `<button class="btn">Save</button>`;

  // The URL of the trimmed stylesheet the page loaded through main.js.
  async function loadPage(dev: DevServer): Promise<string> {
    const stylesheet = (await dev.load("/main.js")).find((url) => url.includes("codenhub-styles"));

    expect(stylesheet).toBeDefined();

    return stylesheet as string;
  }

  it("updates a stylesheet a script imports, in place, when a file names a new class", async () => {
    await writeFiles(SCRIPT_PAGE);
    await withDevServer(async (dev) => {
      const stylesheet = await loadPage(dev);

      expect(hasRuleFor(await dev.fetch(stylesheet, "text/css"), "btn")).toBe(false);

      const from = dev.messages.length;

      await writeFiles({ "view.js": VIEW(BUTTON) });
      await dev.waitFor((message) => updates(message, stylesheet), from);

      expect(hasRuleFor(await dev.fetch(stylesheet, "text/css"), "btn")).toBe(true);
    });
  });

  it("keeps the changed file's own update beside the stylesheet's", async () => {
    await writeFiles(SCRIPT_PAGE);
    await withDevServer(async (dev) => {
      const stylesheet = await loadPage(dev);
      const from = dev.messages.length;

      await writeFiles({ "view.js": VIEW(BUTTON) });

      const message = await dev.waitFor((sent) => updates(sent, stylesheet), from);

      expect(updates(message, "/view.js")).toBe(true);
    });
  });

  it("drops a class's rule once no file names it", async () => {
    await writeFiles({ ...SCRIPT_PAGE, "view.js": VIEW(BUTTON) });
    await withDevServer(async (dev) => {
      const stylesheet = await loadPage(dev);

      expect(hasRuleFor(await dev.fetch(stylesheet, "text/css"), "btn")).toBe(true);

      const from = dev.messages.length;

      await writeFiles({ "view.js": VIEW(`<p>Hi</p>`) });
      await dev.waitFor((message) => updates(message, stylesheet), from);

      expect(hasRuleFor(await dev.fetch(stylesheet, "text/css"), "btn")).toBe(false);
    });
  });

  /* Writing a file empties it before its text lands, and the watcher can report
     it in between. Chokidar 3 drops a second change within 50 ms, so the write
     that follows may never be reported. The watcher is told to leave the file
     alone here, and the report is sent by hand while the file is empty. */
  it("reads a file reported while it was still empty, once its text lands", async () => {
    await writeFiles(SCRIPT_PAGE);

    const view = path.join(project, "view.js");

    await withDevServer(
      async (dev) => {
        const stylesheet = await loadPage(dev);
        const from = dev.messages.length;

        await writeFile(view, "");
        dev.server.watcher.emit("change", view);
        await delay(30);
        await writeFile(view, VIEW(BUTTON));
        await dev.waitFor((message) => updates(message, stylesheet), from);

        expect(hasRuleFor(await dev.fetch(stylesheet, "text/css"), "btn")).toBe(true);
      },
      undefined,
      { server: { host: "127.0.0.1", port: 0, watch: { ignored: [view] } } },
    );
  });

  it("sends no stylesheet update for a change that names the same classes", async () => {
    await writeFiles({ ...SCRIPT_PAGE, "view.js": VIEW(BUTTON) });
    await withDevServer(async (dev) => {
      const stylesheet = await loadPage(dev);
      const from = dev.messages.length;

      await writeFiles({ "view.js": VIEW(`<button class="btn">Send</button>`) });

      const message = await dev.waitFor((sent) => updates(sent, "/view.js"), from);

      expect(updates(message, stylesheet)).toBe(false);
    });
  });

  it("updates only the stylesheets whose trimmed bytes change", async () => {
    await writeFiles({
      ...SCRIPT_PAGE,
      "main.js": `import "@codenhub/styles";\nimport "@codenhub/styles/aesthetics/glass";\nimport "./view.js";\n`,
    });
    await withDevServer(async (dev) => {
      const trimmed = (await dev.load("/main.js")).filter((url) => url.includes("codenhub-styles"));
      const glass = trimmed.find((url) => url.endsWith("/aesthetics/glass.css")) as string;
      const base = trimmed.find((url) => url !== glass) as string;

      expect(trimmed).toHaveLength(2);

      const from = dev.messages.length;

      // The base styles `.kbd`, and the glass aesthetic does not.
      await writeFiles({ "view.js": VIEW(`<kbd class="kbd">K</kbd>`) });

      const message = await dev.waitFor((sent) => updates(sent, base), from);

      expect(hasRuleFor(await dev.fetch(base, "text/css"), "kbd")).toBe(true);
      expect(updates(message, glass)).toBe(false);
    });
  });

  it("updates the stylesheet when a later plugin picks the modules a change updates, as a framework's does", async () => {
    // Says it handled the change and nothing else updates, as @vitejs/plugin-vue does for a part of a component.
    const picky: Plugin = { name: "picky", hotUpdate: () => [], handleHotUpdate: () => [] };

    await writeFiles(SCRIPT_PAGE);
    await withDevServer(
      async (dev) => {
        const stylesheet = await loadPage(dev);
        const from = dev.messages.length;

        await writeFiles({ "src/card.txt": BUTTON });
        await dev.waitFor((message) => updates(message, stylesheet), from);

        expect(hasRuleFor(await dev.fetch(stylesheet, "text/css"), "btn")).toBe(true);
      },
      undefined,
      { plugins: [viteStyles(), picky] },
    );
  });

  it("updates a stylesheet that imports the package through the stylesheet a page links", async () => {
    await writeFiles({
      "index.html": PAGE(`<p>Hello</p>`).replace("</head>", `<link rel="stylesheet" href="/main.css"></head>`),
      "main.js": `import "./view.js";\n`,
      "main.css": `@import "@codenhub/styles";\n`,
      "view.js": VIEW(`<p>Hi</p>`),
    });
    await withDevServer(async (dev) => {
      await dev.load("/main.js");

      expect(hasRuleFor(await dev.fetch("/main.css", "text/css"), "btn")).toBe(false);

      const from = dev.messages.length;

      await writeFiles({ "view.js": VIEW(BUTTON) });
      await dev.waitFor((message) => updates(message, "/main.css"), from);

      expect(hasRuleFor(await dev.fetch("/main.css", "text/css"), "btn")).toBe(true);
    });
  });

  it("reads a file created under the root", async () => {
    await writeFiles(SCRIPT_PAGE);
    await withDevServer(async (dev) => {
      const stylesheet = await loadPage(dev);
      const from = dev.messages.length;

      await writeFiles({ "src/card.txt": BUTTON });
      await dev.waitFor((message) => updates(message, stylesheet), from);

      expect(hasRuleFor(await dev.fetch(stylesheet, "text/css"), "btn")).toBe(true);
    });
  });

  it("drops the classes of a file deleted", async () => {
    await writeFiles({ ...SCRIPT_PAGE, "src/card.txt": BUTTON });
    await withDevServer(async (dev) => {
      const stylesheet = await loadPage(dev);
      const from = dev.messages.length;

      await rm(path.join(project, "src", "card.txt"));
      await dev.waitFor((message) => updates(message, stylesheet), from);

      expect(hasRuleFor(await dev.fetch(stylesheet, "text/css"), "btn")).toBe(false);
    });
  });

  // Vite's own watcher leaves out a build's output folder unless the build keeps what is there.
  it.each([
    ["a folder .gitignore leaves out", "drafts/old.js", { ".gitignore": "drafts/\n" }, {}],
    ["a build's output folder", "dist/assets/old.js", {}, { build: { emptyOutDir: false } }],
  ])("leaves out a file created in %s", async (_, name, files, config) => {
    await writeFiles({ ...SCRIPT_PAGE, ...files });
    await withDevServer(
      async (dev) => {
        const stylesheet = await loadPage(dev);

        await writeFiles({ [name]: BUTTON });
        await dev.watching(path.dirname(path.join(project, name)));

        // A change that does update the stylesheet, made after the one above, so the server has handled both.
        const from = dev.messages.length;

        await writeFiles({ "view.js": VIEW(`<div class="alert">Saved</div>`) });
        await dev.waitFor((message) => updates(message, stylesheet), from);

        const css = await dev.fetch(stylesheet, "text/css");

        expect(hasRuleFor(css, "alert")).toBe(true);
        expect(hasRuleFor(css, "btn")).toBe(false);
      },
      undefined,
      config,
    );
  });

  it("reloads the page for an HTML change, and the page it reloads gets the new stylesheet", async () => {
    await writeFiles(SCRIPT_PAGE);
    await withDevServer(async (dev) => {
      const stylesheet = await loadPage(dev);

      expect(hasRuleFor(await dev.fetch(stylesheet, "text/css"), "btn")).toBe(false);

      const from = dev.messages.length;

      await writeFiles({ "index.html": PAGE(BUTTON) });
      await dev.waitFor((message) => message.type === "full-reload", from);

      expect(hasRuleFor(await dev.fetch(stylesheet, "text/css"), "btn")).toBe(true);
    });
  });

  it("reads the root again when a .gitignore changes", async () => {
    await writeFiles({ ...SCRIPT_PAGE, "drafts/card.txt": BUTTON });
    await withDevServer(async (dev) => {
      const stylesheet = await loadPage(dev);

      expect(hasRuleFor(await dev.fetch(stylesheet, "text/css"), "btn")).toBe(true);

      const from = dev.messages.length;

      await writeFiles({ ".gitignore": "drafts/\n" });
      await dev.waitFor((message) => updates(message, stylesheet), from);

      expect(hasRuleFor(await dev.fetch(stylesheet, "text/css"), "btn")).toBe(false);
    });
  });

  it("reads the root again when a .gitignore above it changes", async () => {
    const app = Object.fromEntries(
      Object.entries({ ...SCRIPT_PAGE, "drafts/card.txt": BUTTON }).map(([name, text]) => [`app/${name}`, text]),
    );

    await writeFiles({ ...app, ".git/HEAD": "ref: refs/heads/main\n", ".gitignore": "*.log\n" });
    await withDevServer(
      async (dev) => {
        const stylesheet = await loadPage(dev);

        expect(hasRuleFor(await dev.fetch(stylesheet, "text/css"), "btn")).toBe(true);

        const from = dev.messages.length;

        await writeFiles({ ".gitignore": "*.log\ndrafts/\n" });
        await dev.waitFor((message) => updates(message, stylesheet), from);

        expect(hasRuleFor(await dev.fetch(stylesheet, "text/css"), "btn")).toBe(false);
      },
      undefined,
      { root: path.join(project, "app") },
    );
  });

  it("writes the trimmed files again into a cache folder deleted while the server runs", async () => {
    await writeFiles(SCRIPT_PAGE);
    await withDevServer(async (dev) => {
      const stylesheet = await loadPage(dev);
      const from = dev.messages.length;

      await rm(path.join(project, "node_modules", ".vite", "codenhub-styles"), { recursive: true });
      await writeFiles({ "view.js": VIEW(BUTTON) });
      await dev.waitFor((message) => updates(message, stylesheet), from);

      expect(hasRuleFor(await dev.fetch(stylesheet, "text/css"), "btn")).toBe(true);
    });
  });

  it("shows the page an error for a trimmed file it cannot write, and writes it once it can", async () => {
    await writeFiles(SCRIPT_PAGE);
    await withDevServer(async (dev) => {
      const stylesheet = await loadPage(dev);
      const cache = path.join(project, "node_modules", ".vite", "codenhub-styles");
      let from = dev.messages.length;

      // A file where the folder was, so the folder cannot be created again.
      await rm(cache, { recursive: true });
      await writeFile(cache, "");
      await writeFiles({ "view.js": VIEW(BUTTON) });

      const message = await dev.waitFor((sent) => sent.type === "error", from, "error for the failed write");

      expect(message.err?.message).toMatch(/^@codenhub\/styles\/vite: cannot write to ".+"/);

      // The next change names no new class, and the stylesheet is still written.
      from = dev.messages.length;
      await rm(cache);
      await writeFiles({ "view.js": VIEW(`<button class="btn">Send</button>`) });
      await dev.waitFor((sent) => updates(sent, stylesheet), from, "stylesheet update once it can write");

      expect(hasRuleFor(await dev.fetch(stylesheet, "text/css"), "btn")).toBe(true);
    });
  });

  it("updates the page for a trimmed file it wrote while writing another failed", async () => {
    await writeFiles(SCRIPT_PAGE);
    await withDevServer(async (dev) => {
      const stylesheet = await loadPage(dev);
      const aesthetics = path.join(project, "node_modules", ".vite", "codenhub-styles");
      const blocked = path.join(
        aesthetics,
        (await readdir(aesthetics)).find((name) => !name.startsWith(".")) ?? "",
        "aesthetics",
      );
      let from = dev.messages.length;

      // The stylesheet the page loads is written; the aesthetics beside it are not.
      await rm(blocked, { recursive: true });
      await writeFile(blocked, "");
      await writeFiles({ "view.js": VIEW(BUTTON) });
      await dev.waitFor((sent) => sent.type === "error", from, "error for the aesthetics it cannot write");

      from = dev.messages.length;
      await rm(blocked);
      await writeFiles({ "view.js": VIEW(`<button class="btn">Send</button>`) });
      await dev.waitFor((sent) => updates(sent, stylesheet), from, "stylesheet update once it can write");

      expect(hasRuleFor(await dev.fetch(stylesheet, "text/css"), "btn")).toBe(true);
    });
  });

  it("updates the stylesheet server-side rendering loads", async () => {
    await writeFiles({ ...SCRIPT_PAGE, "entry.js": `export { default } from "@codenhub/styles?inline";\n` });
    await withDevServer(async (dev) => {
      const before = (await dev.server.ssrLoadModule("/entry.js")) as { default: string };

      expect(hasRuleFor(before.default, "btn")).toBe(false);

      await writeFiles({ "src/card.txt": BUTTON });
      await vi.waitFor(async () => {
        const after = (await dev.server.ssrLoadModule("/entry.js")) as { default: string };

        expect(hasRuleFor(after.default, "btn")).toBe(true);
      }, WAIT);
    });
  });

  it("updates the stylesheet server-side rendering loads after a burst of changes, as a checkout makes", async () => {
    const others = Array.from({ length: 40 }, (_, index) => `src/other-${index}.txt`);

    await writeFiles({
      ...SCRIPT_PAGE,
      ...Object.fromEntries(others.map((name) => [name, "Other\n"])),
      "src/card.txt": "Card\n",
      "entry.js": `export { default } from "@codenhub/styles?inline";\n`,
    });
    await withDevServer(async (dev) => {
      const before = (await dev.server.ssrLoadModule("/entry.js")) as { default: string };

      expect(hasRuleFor(before.default, "btn")).toBe(false);

      // Reported all at once, the change that adds a class first, so the others are in flight while it is.
      await writeFile(path.join(project, "src", "card.txt"), BUTTON);
      for (const name of ["src/card.txt", ...others]) {
        dev.server.watcher.emit("change", path.join(project, name));
      }
      await vi.waitFor(async () => {
        const after = (await dev.server.ssrLoadModule("/entry.js")) as { default: string };

        expect(hasRuleFor(after.default, "btn")).toBe(true);
      }, WAIT);
    });
  });

  it("shows the terminal an error for a trimmed file it cannot write, after a file is created", async () => {
    const errors: string[] = [];
    const logger = vite.createLogger("silent");

    await writeFiles(SCRIPT_PAGE);
    await withDevServer(
      async (dev) => {
        await loadPage(dev);

        const cache = path.join(project, "node_modules", ".vite", "codenhub-styles");
        const from = dev.messages.length;

        // A file where the folder was, so the folder cannot be created again.
        await rm(cache, { recursive: true });
        await writeFile(cache, "");
        await writeFiles({ "src/card.txt": BUTTON });
        await dev.waitFor((sent) => sent.type === "error", from, "error on the page");
        await vi.waitFor(() => {
          expect(errors.some((message) => message.includes("@codenhub/styles/vite: cannot write to"))).toBe(true);
        }, WAIT);
      },
      undefined,
      { customLogger: { ...logger, error: (message) => errors.push(message) } },
    );
  });

  describe("with content outside the root", () => {
    // A component no module of the page imports, as in a shared library the project names in content.
    const CARD = (markup: string) => `export const Card = () => ${markup};\n`;
    let outside: string;

    beforeEach(async () => {
      outside = realpathSync.native(await mkdtemp(path.join(tmpdir(), "styles-vite-shared-")));
      await mkdir(path.join(outside, "cards"));
      await writeFile(path.join(outside, "cards", "a.tsx"), CARD("<p>Card</p>"));
    });

    afterEach(async () => {
      await rm(outside, { recursive: true, force: true, maxRetries: 5 });
    });

    const entry = () => path.relative(project, path.join(outside, "cards")).split(path.sep).join("/") + "/*.tsx";

    it("follows a file an entry names", async () => {
      await writeFiles(SCRIPT_PAGE);
      await withDevServer(
        async (dev) => {
          const stylesheet = await loadPage(dev);

          await dev.watching(path.join(outside, "cards"));

          const from = dev.messages.length;

          // Written again until an update comes: on a loaded machine the watcher can miss a write outside the root.
          await vi.waitFor(
            async () => {
              if (!dev.messages.slice(from).some((message) => updates(message, stylesheet))) {
                await writeFile(path.join(outside, "cards", "a.tsx"), CARD(BUTTON));
                throw new Error(`no stylesheet update among ${JSON.stringify(dev.messages.slice(from))}`);
              }
            },
            { ...WAIT, interval: 300 },
          );

          expect(hasRuleFor(await dev.fetch(stylesheet, "text/css"), "btn")).toBe(true);
        },
        { content: [entry()] },
      );
    });

    it("reads a file created where an entry reads", async () => {
      await writeFiles(SCRIPT_PAGE);
      await withDevServer(
        async (dev) => {
          const stylesheet = await loadPage(dev);

          await dev.watching(path.join(outside, "cards"));

          const from = dev.messages.length;

          await writeFile(path.join(outside, "cards", "b.tsx"), CARD(BUTTON));
          await dev.waitFor((message) => updates(message, stylesheet), from);

          expect(hasRuleFor(await dev.fetch(stylesheet, "text/css"), "btn")).toBe(true);
        },
        { content: [entry()] },
      );
    });
  });
});

// What Rollup's and Rolldown's watchers share, as much of it as the tests use.
interface BuildWatcher {
  on: (name: "event", listener: (event: { code: string; error?: Error }) => void) => unknown;
  close: () => Promise<void>;
}

interface WatchedBuild {
  // Makes a change, repeating it until a build starts, and returns the CSS the build after it emits.
  rebuild: (change: () => Promise<void>) => Promise<string>;
}

// A build in watch mode, its first build ended, closed once `use` settles.
async function withWatchedBuild(
  use: (build: WatchedBuild) => Promise<void>,
  options?: ViteStylesOptions,
  config: InlineConfig = {},
): Promise<void> {
  const watcher = (await vite.build({
    root: project,
    configFile: false,
    logLevel: "silent",
    plugins: [viteStyles(options)],
    build: { watch: {} },
    ...config,
  })) as unknown as BuildWatcher;
  let starts = 0;
  let ends = 0;
  let failure: Error | undefined;

  watcher.on("event", (event) => {
    starts += event.code === "START" ? 1 : 0;
    ends += event.code === "END" ? 1 : 0;
    failure = event.code === "ERROR" ? event.error : failure;
  });

  const ended = async (count: number): Promise<void> => {
    await vi.waitFor(() => {
      if (failure !== undefined) {
        throw failure;
      }
      expect(ends).toBeGreaterThanOrEqual(count);
    }, WAIT);
  };

  try {
    await ended(1);
    await use({
      rebuild: async (change) => {
        const before = starts;

        // The watcher takes a moment to watch a file after the build that added it, so a change it missed is made again.
        await vi.waitFor(
          async () => {
            if (starts === before) {
              await change();
              throw new Error("no build started");
            }
          },
          { ...WAIT, interval: 300 },
        );
        await vi.waitFor(() => expect(ends).toBe(starts), WAIT);
        if (failure !== undefined) {
          throw failure;
        }

        return readCss(path.join(project, "dist"));
      },
    });
  } finally {
    await watcher.close();
  }
}

describe("viteStyles: build --watch", { timeout: 40_000 }, () => {
  const BUTTON = `<button class="btn">Save</button>`;

  it("rebuilds with the classes a changed file names, though no module imports it", async () => {
    await writeFiles({
      "index.html": PAGE(`<p>Hello</p>`),
      "main.js": `import "@codenhub/styles";\n`,
      "card.txt": "Card\n",
    });
    await withWatchedBuild(async ({ rebuild }) => {
      const css = await rebuild(() => writeFiles({ "card.txt": BUTTON }));

      expect(hasRuleFor(css, "btn")).toBe(true);
    });
  });

  it("rebuilds a stylesheet that imports the package", async () => {
    await writeFiles({
      "index.html": PAGE(`<p>Hello</p>`),
      "main.js": `import "./app.css";\n`,
      "app.css": `@import "@codenhub/styles";\n`,
      "card.txt": "Card\n",
    });
    await withWatchedBuild(async ({ rebuild }) => {
      const css = await rebuild(() => writeFiles({ "card.txt": BUTTON }));

      expect(hasRuleFor(css, "btn")).toBe(true);
    });
  });

  it("drops the classes of a file deleted", async () => {
    await writeFiles({
      "index.html": PAGE(`<p>Hello</p>`),
      "main.js": `import "@codenhub/styles";\n`,
      "card.txt": BUTTON,
    });
    await withWatchedBuild(async ({ rebuild }) => {
      const css = await rebuild(() => rm(path.join(project, "card.txt"), { force: true }));

      expect(hasRuleFor(css, "btn")).toBe(false);
    });
  });

  it("leaves out the output it wrote, for a root named through a link and no output folder yet", async () => {
    // A link stands for any root spelled other than its real path: a subst drive, an 8.3 name, a path in another case.
    const other = realpathSync.native(await mkdtemp(path.join(tmpdir(), "styles-vite-link-")));
    const root = path.join(other, "app");
    const readScripts = async (): Promise<string> => {
      const folder = path.join(project, "dist", "assets");
      const files = (await readdir(folder)).filter((name) => name.endsWith(".js"));

      return (await Promise.all(files.map((name) => readFile(path.join(folder, name), "utf8")))).join("");
    };

    await symlink(project, root, "junction");
    await writeFiles({
      "index.html": PAGE(`<p>Hello</p>`),
      // The stylesheet's text lands in the script the build writes, which then names every class it kept.
      "main.js": `import css from "@codenhub/styles?inline";\ndocument.head.append(Object.assign(document.createElement("style"), { textContent: css }));\n`,
      "card.txt": BUTTON,
    });
    try {
      await withWatchedBuild(
        async ({ rebuild }) => {
          expect(hasRuleFor(await readScripts(), "btn")).toBe(true);

          await rebuild(() => writeFiles({ "card.txt": "Card\n" }));

          expect(hasRuleFor(await readScripts(), "btn")).toBe(false);
        },
        undefined,
        // Vite 8 and newer resolve the root to its real path unless told to keep links.
        { root, resolve: { preserveSymlinks: true } },
      );
    } finally {
      await rm(other, { recursive: true, force: true });
    }
  });

  it("reads a file created while it runs at the next rebuild", async () => {
    await writeFiles({ "index.html": PAGE(`<p>Hello</p>`), "main.js": `import "@codenhub/styles";\n` });
    await withWatchedBuild(async ({ rebuild }) => {
      // Nothing watches the new file's folder, so the module edited after it starts the rebuild.
      const css = await rebuild(async () => {
        await writeFiles({ "card.txt": BUTTON });
        await writeFiles({ "main.js": `import "@codenhub/styles";\n// card\n` });
      });

      expect(hasRuleFor(css, "btn")).toBe(true);
    });
  });
});

describe("viteStyles: paths", () => {
  it("trims for a root whose path holds a space, a $, and brackets", async () => {
    const root = path.join(project, "my app $& [v2]");

    await writeFiles({
      "my app $& [v2]/package.json": `{ "name": "app", "private": true, "type": "module" }\n`,
      "my app $& [v2]/index.html": PAGE(`<button class="btn primary">Save</button>`),
      "my app $& [v2]/main.js": `import "@codenhub/styles";\n`,
    });

    await vite.build({ root, configFile: false, logLevel: "silent", plugins: [viteStyles()] });
    const css = await readCss(path.join(root, "dist"));

    expect(hasRuleFor(css, "btn")).toBe(true);
    expect(hasRuleFor(css, "alert")).toBe(false);
  });
});

describe("viteStyles: the command's bytes", () => {
  it("writes what chs build writes for the same files", async () => {
    await writeFiles({
      "index.html": PAGE(`<button class="btn primary">Save</button><div class="alert md:card">Saved</div>`),
      "entry.js": `export { default } from "@codenhub/styles?raw";\n`,
    });

    const { default: css } = await loadInDev("/entry.js");

    expect(css).toBe(await chsBuild("--content", "index.html", "--content", "entry.js", "--content", "package.json"));
  });

  // A page with no StyleKit class, so every aesthetic loses rules and an untrimmed one shows.
  it.each(readAestheticNames())(
    "writes the stylesheet and the %s aesthetic as chs build --aesthetic writes them together",
    async (name) => {
      await writeFiles({
        "index.html": PAGE(`<p>No StyleKit class here.</p>`),
        "entry.js": `export { default as base } from "@codenhub/styles?raw";\nexport { default as aesthetic } from "@codenhub/styles/aesthetics/${name}?raw";\n`,
      });

      const { base, aesthetic } = await loadInDev("/entry.js");
      const content = ["index.html", "entry.js", "package.json"].flatMap((file) => ["--content", file]);

      expect(base + aesthetic).toBe(await chsBuild(...content, "--aesthetic", name));
    },
  );
});
