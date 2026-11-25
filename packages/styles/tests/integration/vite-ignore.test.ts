import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { walkProject } from "../../src/vite/ignore";

/* The plugin's `.gitignore` rules are an in-house port of git's, so each case
   here is checked against git itself on the same files: what
   `git ls-files --others --exclude-standard` lists is what the walk yields. */

// Windows links a file only with Developer Mode on or as an administrator.
const canLinkFiles = await probeFileLinks();

async function probeFileLinks(): Promise<boolean> {
  const probe = await mkdtemp(path.join(tmpdir(), "styles-ignore-link-"));

  try {
    await writeFile(path.join(probe, "target"), "");
    await symlink(path.join(probe, "target"), path.join(probe, "link"), "file");

    return true;
  } catch (error) {
    if ((error as { code?: string }).code !== "EPERM") {
      throw error;
    }

    return false;
  } finally {
    await rm(probe, { recursive: true, force: true });
  }
}

let temporary: string;
let folder: string;
let emptyConfig: string;

beforeEach(async () => {
  temporary = realpathSync.native(await mkdtemp(path.join(tmpdir(), "styles-ignore-")));
  folder = path.join(temporary, "repository");
  emptyConfig = path.join(temporary, "empty.gitconfig");
  await mkdir(folder);
  await writeFile(emptyConfig, "");
});

afterEach(async () => {
  await rm(temporary, { recursive: true, force: true, maxRetries: 5 });
});

type Tree = Record<string, string | Buffer>;

async function writeTree(root: string, tree: Tree): Promise<void> {
  await Promise.all(
    Object.entries(tree).map(async ([name, content]) => {
      const file = path.join(root, name);

      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, content);
    }),
  );
}

// Git with no configuration but this repository's, matching case as the plugin does on every system.
function git(cwd: string, args: string[]): string {
  return execFileSync("git", ["-c", "core.ignorecase=false", "-c", `core.excludesFile=${emptyConfig}`, ...args], {
    cwd,
    encoding: "utf8",
    // A warning, such as for a `.gitignore` that is a link, stays out of the test output; a failure still carries it.
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_CONFIG_GLOBAL: emptyConfig, GIT_CONFIG_NOSYSTEM: "1" },
  });
}

function listedByGit(root: string): string[] {
  return git(root, ["ls-files", "--others", "--exclude-standard", "-z"])
    .split("\0")
    .filter((name) => name !== "")
    .toSorted();
}

function walked(root: string): string[] {
  return [...walkProject({ root, skip: new Set() })]
    .map((file) => path.relative(root, file).split(path.sep).join("/"))
    .toSorted();
}

// What the walk yields from the root and what git lists there, for the same files in a new repository.
async function walkBesideGit(tree: Tree, { app = "" } = {}): Promise<{ walked: string[]; listed: string[] }> {
  await writeTree(folder, tree);
  git(folder, ["init", "--quiet"]);

  const root = path.join(folder, app);

  return { walked: walked(root), listed: listedByGit(root) };
}

const SYNTAX = [
  "# a comment, then a blank line",
  "",
  "*.log",
  "!keep.log",
  "build/",
  "/root-only.txt",
  String.raw`\#hash.txt`,
  String.raw`\!bang.txt`,
  "trailing.txt   ",
  "tab.txt\t",
  "doc/*.txt",
  "doc/**/*.md",
  "**/deep.txt",
  "lib/**",
  "a?c.txt",
  "[ab]x.txt",
  "[!ab]y.txt",
  "[^ab]z.txt",
  "[[:digit:]]n.txt",
  "[a-c]r.txt",
  "[]]q.txt",
  "[[:upper:]]u.txt",
  "[[:alpha:][:digit:]]v.txt",
  "[[:bogus:]]w.txt",
  "[unclosed.txt",
  "*.TXT2",
  "caf?.txt",
  "x**/y.txt",
  "cache/",
  "nested/a/**/b.txt",
  "nested/**/b*c/d.txt",
  "**/any/",
].join("\n");

const SYNTAX_FILES = [
  "app.log",
  "keep.log",
  "sub/app.log",
  "build/out.js",
  "src/build/out.js",
  "root-only.txt",
  "sub/root-only.txt",
  "#hash.txt",
  "!bang.txt",
  "trailing.txt",
  "tab.txt",
  "doc/one.txt",
  "doc/deeper/two.txt",
  "doc/notes.md",
  "doc/deeper/three.md",
  "sub/doc/one.txt",
  "deep.txt",
  "sub/x/deep.txt",
  "lib/inside.txt",
  "lib/b/inside.txt",
  "abc.txt",
  "axc.txt",
  "ax.txt",
  "cx.txt",
  "ay.txt",
  "cy.txt",
  "az.txt",
  "cz.txt",
  "1n.txt",
  "xn.txt",
  "br.txt",
  "dr.txt",
  "]q.txt",
  "Uu.txt",
  "uu.txt",
  "av.txt",
  "7v.txt",
  "-v.txt",
  "Bw.txt",
  "[unclosed.txt",
  "notes.txt2",
  "cafe.txt",
  "café.txt",
  "xa/y.txt",
  "xa/b/y.txt",
  "cache/c.txt",
  "sub/cache",
  "nested/a/b.txt",
  "nested/a/1/2/b.txt",
  "nested/c/b.txt",
  "nested/x/bzz/y/bcc/d.txt",
  "nested/bc/d.txt",
  "any/f.txt",
  "sub/any/f.txt",
  "sub/many/f.txt",
];

describe("walkProject: the files git lists", () => {
  it("reads every pattern form as git does", async () => {
    const tree: Tree = { ".gitignore": `${SYNTAX}\n` };

    for (const file of SYNTAX_FILES) {
      tree[file] = "x";
    }

    const { walked: read, listed } = await walkBesideGit(tree);

    expect(read).toEqual(listed);
    // The case is not empty: some files are left out and some are not.
    expect(listed).toContain("keep.log");
    expect(listed).not.toContain("app.log");
  });

  it("takes a deeper .gitignore over a higher one, and never reads into a folder left out", async () => {
    const { walked: read, listed } = await walkBesideGit({
      ".gitignore": "*.log\nex/\n!ex/keep.txt\n",
      "sub/.gitignore": "!*.log\n/anchored.txt\nlocal/\n",
      "x.log": "x",
      "sub/x.log": "x",
      "sub/deeper/x.log": "x",
      "ex/keep.txt": "x",
      "ex/other.txt": "x",
      "anchored.txt": "x",
      "sub/anchored.txt": "x",
      "sub/deeper/anchored.txt": "x",
      "sub/local/f.txt": "x",
      "local/f.txt": "x",
    });

    expect(read).toEqual(listed);
  });

  it("lets the last matching line win", async () => {
    const { walked: read, listed } = await walkBesideGit({
      ".gitignore": "*.txt\n!a.txt\nb.txt\n!b.txt\nc.txt\n",
      "a.txt": "x",
      "b.txt": "x",
      "c.txt": "x",
      "d.txt": "x",
      "e.js": "x",
    });

    expect(read).toEqual(listed);
  });

  it("leaves out every file for a lone `**`, re-including only what is not under a folder", async () => {
    const { walked: read, listed } = await walkBesideGit({
      ".gitignore": "**\n!*.txt\n",
      "a.txt": "x",
      "b.js": "x",
      "dir/c.txt": "x",
    });

    expect(read).toEqual(listed);
  });

  it("re-includes a folder after excluding everything at the top", async () => {
    const { walked: read, listed } = await walkBesideGit({
      ".gitignore": "/*\n!/src/\n",
      "root.txt": "x",
      "src/a.txt": "x",
      "lib/b.txt": "x",
    });

    expect(read).toEqual(listed);
  });

  it.skipIf(!canLinkFiles)("reads no .gitignore that is a link", async () => {
    await writeTree(folder, { "rules.txt": "page.html\n", "page.html": "x" });
    await symlink(path.join(folder, "rules.txt"), path.join(folder, ".gitignore"), "file");

    const { walked: read, listed } = await walkBesideGit({});

    expect(listed).toContain("page.html");
    expect(read).toEqual(listed);
  });

  it("reads a .gitignore with Windows line ends and a byte order mark", async () => {
    const { walked: read, listed } = await walkBesideGit({
      ".gitignore": Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("*.log\r\n\r\n!keep.log\r\n")]),
      "a.log": "x",
      "keep.log": "x",
      "b.txt": "x",
    });

    expect(read).toEqual(listed);
  });

  it("applies every .gitignore above the root up to the repository's own folder, relative to its folder", async () => {
    const { walked: read, listed } = await walkBesideGit(
      {
        ".gitignore": "/app/generated/\n*.tmp\n!app/keep.tmp\napp/*.bak\n",
        "other/.gitignore": "*.js\n",
        "app/.gitignore": "local.txt\n",
        "app/generated/g.js": "x",
        "app/x.tmp": "x",
        "app/keep.tmp": "x",
        "app/x.bak": "x",
        "app/sub/x.bak": "x",
        "app/src/a.js": "x",
        "app/local.txt": "x",
      },
      { app: "app" },
    );

    expect(read).toEqual(listed);
    expect(listed).toContain("src/a.js");
  });

  it.skipIf(process.platform === "win32")("reads names Windows does not allow, as git does", async () => {
    const tree: Tree = {
      ".gitignore": [
        String.raw`escaped\ `,
        "[[:space:]]s.txt",
        "[[:cntrl:]]c.txt",
        "[[:punct:]]p.txt",
        "q\\?.txt",
      ].join("\n"),
      "escaped ": "x",
      escaped: "x",
      " s.txt": "x",
      "\ts.txt": "x",
      "\vs.txt": "x",
      "\u0001c.txt": "x",
      "*p.txt": "x",
      "ap.txt": "x",
      "q?.txt": "x",
      "qa.txt": "x",
    };

    const { walked: read, listed } = await walkBesideGit(tree);

    expect(read).toEqual(listed);
  });
});

describe("walkProject: beyond what git lists", () => {
  it("reads a root its repository leaves out", async () => {
    await writeTree(folder, { ".git/HEAD": "ref: refs/heads/main\n", ".gitignore": "/app/\n", "app/a.txt": "x" });

    expect(walked(path.join(folder, "app"))).toEqual(["a.txt"]);
  });

  it("finds the repository's folder when .git is a file, as in a worktree", async () => {
    await writeTree(folder, {
      ".git": "gitdir: elsewhere\n",
      ".gitignore": "*.tmp\n",
      "app/a.txt": "x",
      "app/b.tmp": "x",
    });

    expect(walked(path.join(folder, "app"))).toEqual(["a.txt"]);
  });

  it("reads no .gitignore above the root outside a repository", async () => {
    await writeTree(folder, { ".gitignore": "*.tmp\n", "app/a.txt": "x", "app/b.tmp": "x" });

    expect(walked(path.join(folder, "app"))).toEqual(["a.txt", "b.tmp"]);
  });

  it("leaves out node_modules, .git, and the folders it is told to skip, at any depth", async () => {
    await writeTree(folder, {
      "a.txt": "x",
      "node_modules/p/index.js": "x",
      "sub/node_modules/p/index.js": "x",
      "sub/.git/HEAD": "x",
      "out/b.js": "x",
      "sub/out/c.js": "x",
    });

    const files = [...walkProject({ root: folder, skip: new Set([path.join(folder, "out")]) })];

    expect(files.map((file) => path.relative(folder, file).split(path.sep).join("/")).toSorted()).toEqual([
      "a.txt",
      "sub/out/c.js",
    ]);
  });
});
