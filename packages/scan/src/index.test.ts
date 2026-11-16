import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
  });
});

describe("readFiles", () => {
  it("yields the text of each file as UTF-8", () => {
    fs.writeFileSync(path.join(root, "app", "views", "a.html"), "café ✓");

    expect([...readFiles(["app/views/a.html"], { cwd: root })]).toEqual(["café ✓"]);
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

  it("fails before reading on an entry that names no file, with failOnUnmatched", () => {
    expect(() => readFiles(["app/views/a.html", "missing.html"], { cwd: root, failOnUnmatched: true })).toThrow(
      UnmatchedEntryError,
    );
  });
});

describe("splitWords", () => {
  it("splits on every character outside the set", () => {
    expect(splitWords('<a class="btn primary md:lg">x/1.5</a>', String.raw`\w:-`)).toEqual([
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
    expect(splitWords("ic-heart/1.5, ic-star", String.raw`\w/.-`)).toEqual(["ic-heart/1.5", "ic-star"]);
  });

  it("returns no empty word", () => {
    expect(splitWords("  ", String.raw`\w`)).toEqual([]);
    expect(splitWords("", String.raw`\w`)).toEqual([]);
  });
});
