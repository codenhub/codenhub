import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { findFiles, readFiles, splitWords, UnmatchedEntryError } from "./index.ts";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "codenhub-scan-"));
  fs.mkdirSync(path.join(root, "app", "[id]"), { recursive: true });
  fs.mkdirSync(path.join(root, "app", "views", "nested"), { recursive: true });
  fs.writeFileSync(path.join(root, "app", "[id]", "page.tsx"), "bracket");
  fs.writeFileSync(path.join(root, "app", "views", "a.html"), "a");
  fs.writeFileSync(path.join(root, "app", "views", "nested", "b.html"), "b");
  fs.writeFileSync(path.join(root, "app", "views", "notes.md"), "notes");
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const relative = (files: string[]) => files.map((file) => path.relative(root, file).split(path.sep).join("/")).sort();

describe("findFiles", () => {
  it("reads a literal path as a file, even when it holds a bracket", () => {
    expect(relative(findFiles(["app/[id]/page.tsx"], { cwd: root }))).toEqual(["app/[id]/page.tsx"]);
  });

  it("expands an entry that names no file as a glob", () => {
    expect(relative(findFiles(["app/views/**/*.html"], { cwd: root }))).toEqual([
      "app/views/a.html",
      "app/views/nested/b.html",
    ]);
  });

  it("expands an extglob entry, which holds no other glob character", () => {
    expect(relative(findFiles(["app/views/@(a.html|notes.md)"], { cwd: root }))).toEqual([
      "app/views/a.html",
      "app/views/notes.md",
    ]);
  });

  it("returns absolute paths", () => {
    for (const file of findFiles(["app/views/*.html"], { cwd: root })) {
      expect(path.isAbsolute(file)).toBe(true);
    }
  });

  it("takes an absolute entry as it is", () => {
    expect(relative(findFiles([path.join(root, "app", "views", "a.html")], { cwd: os.tmpdir() }))).toEqual([
      "app/views/a.html",
    ]);
  });

  it("lists a file named by two entries once", () => {
    expect(relative(findFiles(["app/views/a.html", "app/views/*.html"], { cwd: root }))).toEqual(["app/views/a.html"]);
  });

  it("leaves out the folders a glob matches", () => {
    expect(relative(findFiles(["app/views/**"], { cwd: root }))).toEqual([
      "app/views/a.html",
      "app/views/nested/b.html",
      "app/views/notes.md",
    ]);
  });

  describe("skipNodeModules", () => {
    beforeEach(() => {
      for (const folder of ["node_modules/dep", "app/node_modules/dep"]) {
        fs.mkdirSync(path.join(root, folder), { recursive: true });
        fs.writeFileSync(path.join(root, folder, "demo.html"), "dependency");
      }
    });

    it("keeps a wildcard out of every node_modules folder", () => {
      expect(relative(findFiles(["**/*.html"], { cwd: root, skipNodeModules: true }))).toEqual([
        "app/views/a.html",
        "app/views/nested/b.html",
      ]);
    });

    it("reads node_modules when the entry names it", () => {
      expect(relative(findFiles(["node_modules/**/*.html"], { cwd: root, skipNodeModules: true }))).toEqual([
        "node_modules/dep/demo.html",
      ]);
    });

    it.each(["{app/views,node_modules/dep}/**/*.html", "@(app|node_modules)/**/*.html"])(
      "reads node_modules when an alternative of %s names it",
      (entry) => {
        expect(relative(findFiles([entry], { cwd: root, skipNodeModules: true }))).toEqual(
          expect.arrayContaining(["app/views/a.html", "node_modules/dep/demo.html"]),
        );
      },
    );

    it("reads node_modules without it", () => {
      expect(relative(findFiles(["**/*.html"], { cwd: root }))).toContain("node_modules/dep/demo.html");
    });

    it("fails on an entry that matches only files in node_modules", () => {
      expect(() => findFiles(["**/demo.html"], { cwd: root, skipNodeModules: true, failOnUnmatched: true })).toThrow(
        UnmatchedEntryError,
      );
    });
  });

  it("follows a link a glob matches to the file it names", (context) => {
    try {
      fs.symlinkSync(path.join(root, "app", "views", "a.html"), path.join(root, "app", "linked.html"), "file");
    } catch {
      // Windows refuses a symbolic link without developer mode or elevation.
      context.skip();
    }

    expect(relative(findFiles(["app/*.html"], { cwd: root }))).toEqual(["app/linked.html"]);
  });

  it("names no file for a literal folder", () => {
    expect(findFiles(["app/views"], { cwd: root })).toEqual([]);
  });

  it("names no file for an entry that matches nothing", () => {
    expect(findFiles(["missing.html", "app/view/**/*.html"], { cwd: root })).toEqual([]);
  });

  it("reads relative entries from the working directory by default", () => {
    const previous = process.cwd();

    process.chdir(root);
    try {
      expect(relative(findFiles(["app/views/a.html"]))).toEqual(["app/views/a.html"]);
    } finally {
      process.chdir(previous);
    }
  });

  describe("with failOnUnmatched", () => {
    it("fails on an entry that names no file, naming the entry and the folder", () => {
      expect(() => findFiles(["app/views/*.html", "app/view/**/*.erb"], { cwd: root, failOnUnmatched: true })).toThrow(
        new UnmatchedEntryError("app/view/**/*.erb", root),
      );
    });

    it("words its message after the entry and the folder", () => {
      const error = new UnmatchedEntryError("app/view/**/*.erb", root);

      expect(error.message).toBe(
        `"app/view/**/*.erb" matches no file in ${root}; check the path, or run from the project root.`,
      );
      expect(error).toMatchObject({ entry: "app/view/**/*.erb", cwd: root });
    });

    it("fails on a literal folder", () => {
      expect(() => findFiles(["app/views"], { cwd: root, failOnUnmatched: true })).toThrow(UnmatchedEntryError);
    });

    // "Check the path" sent a reader to fix a path that was right: it names a folder, not the files in it.
    it.each(["app/views", "app/views/"])("says %s is a folder and shows a glob for its files", (entry) => {
      expect(() => findFiles([entry], { cwd: root, failOnUnmatched: true })).toThrow(
        `"${entry}" is a folder in ${root}, not a file; name the files in it, as in "app/views/**/*".`,
      );
    });

    it("says a wildcard skips node_modules when its only matches are there", () => {
      fs.mkdirSync(path.join(root, "node_modules", "dep"), { recursive: true });
      fs.writeFileSync(path.join(root, "node_modules", "dep", "demo.html"), "dependency");

      expect(() => findFiles(["**/demo.html"], { cwd: root, skipNodeModules: true, failOnUnmatched: true })).toThrow(
        `"**/demo.html" matches no file in ${root}; a * or ** does not enter node_modules, so name the folder to read one, as in "node_modules/<package>/**/*".`,
      );
    });

    // `[locale]` is a set matching one of its letters; on Windows `\[` is a separator, not an escape.
    it("says how to match a bracket when an entry holding one matches nothing", () => {
      fs.mkdirSync(path.join(root, "app", "[locale]"));
      fs.writeFileSync(path.join(root, "app", "[locale]", "page.tsx"), "locale");

      expect(() => findFiles(["app/[locale]/**/*.tsx"], { cwd: root, failOnUnmatched: true })).toThrow(
        `"app/[locale]/**/*.tsx" matches no file in ${root}; a [ in a glob starts a set of characters, so write [[] for a bracket in a name, as in "app/[[]locale]/**/*.tsx".`,
      );
      expect(relative(findFiles(["app/[[]locale]/**/*.tsx"], { cwd: root }))).toEqual(["app/[locale]/page.tsx"]);
    });
  });
});

describe("readFiles", () => {
  it("yields the text of each file as UTF-8", () => {
    fs.writeFileSync(path.join(root, "app", "views", "a.html"), "café ✓");

    expect([...readFiles(["app/views/a.html"], { cwd: root })]).toEqual(["café ✓"]);
  });

  /* Windows PowerShell 5.1 writes UTF-16 LE with a byte order mark, as in
     `"card" > safelist.txt`, and read as UTF-8 every other byte is a NUL, so
     no word was found in it. */
  it.each([
    ["UTF-16 LE", Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("café ✓\r\n", "utf16le")])],
    ["UTF-16 BE", Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from("café ✓\r\n", "utf16le").swap16()])],
    ["UTF-8", Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("café ✓\r\n")])],
  ])("decodes a file that starts with a %s byte order mark, and drops the mark", (_, bytes) => {
    fs.writeFileSync(path.join(root, "app", "views", "a.html"), bytes);

    expect([...readFiles(["app/views/a.html"], { cwd: root })]).toEqual(["café ✓\r\n"]);
  });

  // Without a mark, a file is UTF-8 even when it could be read otherwise.
  it("reads a file without a byte order mark as UTF-8", () => {
    fs.writeFileSync(path.join(root, "app", "views", "a.html"), Buffer.from("ab", "utf16le"));

    expect([...readFiles(["app/views/a.html"], { cwd: root })]).toEqual(["a\0b\0"]);
  });

  it("reads one file at a time", () => {
    const texts = readFiles(["app/views/**/*.html"], { cwd: root });

    expect(texts.next().value).toBeDefined();
    // The second file is read only when it is asked for, so deleting it first leaves nothing to read.
    fs.rmSync(path.join(root, "app", "views", "nested"), { recursive: true });
    fs.rmSync(path.join(root, "app", "views", "a.html"));
    expect([...texts]).toEqual([]);
  });

  it("skips a file it cannot read", () => {
    const texts = readFiles(["app/views/a.html", "app/views/nested/b.html"], { cwd: root });

    fs.rmSync(path.join(root, "app", "views", "a.html"));
    expect([...texts]).toEqual(["b"]);
  });

  it("passes on Node.js's own error for a file it cannot read, with failOnUnreadable", () => {
    const texts = readFiles(["app/views/a.html"], { cwd: root, failOnUnreadable: true });

    fs.rmSync(path.join(root, "app", "views", "a.html"));
    expect(() => [...texts]).toThrow(/ENOENT/);
  });

  // Node.js names the path in a system error such as ENOENT, but not when the text is too long for one string.
  it("names the file in an error that does not, with failOnUnreadable", () => {
    const cause = new RangeError("Cannot create a string longer than 0x1fffffe8 characters");
    const read = vi.spyOn(fs, "readFileSync").mockImplementation(() => {
      throw cause;
    });

    try {
      const texts = readFiles(["app/views/a.html"], { cwd: root, failOnUnreadable: true });

      expect(() => [...texts]).toThrow(
        expect.objectContaining({
          message: `${path.join(root, "app", "views", "a.html")}: ${cause.message}`,
          cause,
        }),
      );
    } finally {
      read.mockRestore();
    }
  });

  it("fails before reading on an entry that names no file, with failOnUnmatched", () => {
    expect(() => readFiles(["app/views/a.html", "missing.html"], { cwd: root, failOnUnmatched: true })).toThrow(
      UnmatchedEntryError,
    );
  });
});

describe("splitWords", () => {
  it("splits on every character outside the set", () => {
    expect([...splitWords('<a class="btn primary md:lg">x/1.5</a>', String.raw`\w:-`)]).toEqual([
      "a",
      "class",
      "btn",
      "primary",
      "md:lg",
      "x",
      "1",
      "5",
      "a",
    ]);
  });

  it("keeps the characters the caller adds", () => {
    expect([...splitWords("ic-heart/1.5, ic-star", String.raw`\w/.-`)]).toEqual(["ic-heart/1.5", "ic-star"]);
  });

  it("returns no empty word", () => {
    expect([...splitWords("  ", String.raw`\w`)]).toEqual([]);
    expect([...splitWords("", String.raw`\w`)]).toEqual([]);
  });

  /* A file of a few hundred megabytes split into an array held every word
     beside the text, several times the file's size. */
  it("yields one word at a time", () => {
    const words = splitWords("btn primary", String.raw`\w`);

    expect(Array.isArray(words)).toBe(false);
    expect(words.next().value).toBe("btn");
    expect(words.next().value).toBe("primary");
    expect(words.next().done).toBe(true);
  });

  it("starts again on every call with the same characters", () => {
    const first = splitWords("a b", String.raw`\w`);

    first.next();
    expect([...splitWords("c d", String.raw`\w`)]).toEqual(["c", "d"]);
    expect([...first]).toEqual(["b"]);
  });

  it("takes a leading caret as a character", () => {
    expect([...splitWords("a^b c", "^\\w")]).toEqual(["a^b", "c"]);
  });
});
