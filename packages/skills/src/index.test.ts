import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { parseFrontmatter, getSkills, copyRecursiveSync } from "./index.js";

describe("parseFrontmatter", () => {
  it("should parse valid frontmatter", () => {
    const content = `---\nname: test-skill\ndescription: A test skill description\n---\nSome markdown here`;
    const meta = parseFrontmatter(content);
    expect(meta).toEqual({
      name: "test-skill",
      description: "A test skill description",
    });
  });

  it("should strip surrounding quotes from frontmatter values", () => {
    const content = `---\nname: "test-skill"\ndescription: 'A test skill description'\n---\nSome markdown here`;
    const meta = parseFrontmatter(content);
    expect(meta).toEqual({
      name: "test-skill",
      description: "A test skill description",
    });
  });

  it("should return empty object if no frontmatter", () => {
    const content = "no frontmatter here";
    const meta = parseFrontmatter(content);
    expect(meta).toEqual({});
  });

  it("should strip trailing comments from unquoted values", () => {
    const content = `---\nname: test-skill # this is name\ndescription: A test skill # this is description\n---\nSome markdown here`;
    const meta = parseFrontmatter(content);
    expect(meta).toEqual({
      name: "test-skill",
      description: "A test skill",
    });
  });

  it("should not strip hash characters inside quotes", () => {
    const content = `---\nname: "test #1 skill" # comment\ndescription: 'A test #2 skill'\n---\nSome markdown here`;
    const meta = parseFrontmatter(content);
    expect(meta).toEqual({
      name: "test #1 skill",
      description: "A test #2 skill",
    });
  });

  it("should not strip hash characters without preceding whitespace in unquoted values", () => {
    const content = `---\nname: test#1skill\ndescription: https://github.com/obra/superpowers#readme\n---\n`;
    const meta = parseFrontmatter(content);
    expect(meta).toEqual({
      name: "test#1skill",
      description: "https://github.com/obra/superpowers#readme",
    });
  });
});

describe("getSkills", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codenhub-skills-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("should return skills list from directory", () => {
    const skill1Dir = path.join(tempDir, "skill-1");
    fs.mkdirSync(skill1Dir, { recursive: true });
    fs.writeFileSync(path.join(skill1Dir, "SKILL.md"), `---\nname: Skill One\ndescription: First skill\n---\n`);

    const skill2Dir = path.join(tempDir, "skill-2");
    fs.mkdirSync(skill2Dir, { recursive: true });
    fs.writeFileSync(path.join(skill2Dir, "SKILL.md"), `---\nname: Skill Two\ndescription: Second skill\n---\n`);

    // Non-skill dir (no SKILL.md)
    const otherDir = path.join(tempDir, "other");
    fs.mkdirSync(otherDir, { recursive: true });

    const skills = getSkills(tempDir);
    expect(skills).toHaveLength(2);
    expect(skills.find((s) => s.id === "skill-1")).toEqual({
      id: "skill-1",
      name: "Skill One",
      description: "First skill",
      path: skill1Dir,
    });
  });

  it("should return empty array if directory does not exist", () => {
    const skills = getSkills(path.join(tempDir, "non-existent"));
    expect(skills).toEqual([]);
  });
});

describe("copyRecursiveSync", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codenhub-skills-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("should recursively copy files and folders", () => {
    const srcDir = path.join(tempDir, "src");
    const destDir = path.join(tempDir, "dest");

    fs.mkdirSync(path.join(srcDir, "subdir"), { recursive: true });
    fs.writeFileSync(path.join(srcDir, "file1.txt"), "content 1");
    fs.writeFileSync(path.join(srcDir, "subdir", "file2.txt"), "content 2");

    copyRecursiveSync({ src: srcDir, dest: destDir });

    expect(fs.existsSync(path.join(destDir, "file1.txt"))).toBe(true);
    expect(fs.readFileSync(path.join(destDir, "file1.txt"), "utf8")).toBe("content 1");
    expect(fs.existsSync(path.join(destDir, "subdir", "file2.txt"))).toBe(true);
    expect(fs.readFileSync(path.join(destDir, "subdir", "file2.txt"), "utf8")).toBe("content 2");
  });

  it("should overwrite existing files and merge folders without EEXIST errors", () => {
    const srcDir = path.join(tempDir, "src");
    const destDir = path.join(tempDir, "dest");

    fs.mkdirSync(path.join(srcDir, "subdir"), { recursive: true });
    fs.writeFileSync(path.join(srcDir, "file1.txt"), "new content 1");
    fs.writeFileSync(path.join(srcDir, "subdir", "file2.txt"), "new content 2");

    fs.mkdirSync(path.join(destDir, "subdir"), { recursive: true });
    fs.writeFileSync(path.join(destDir, "file1.txt"), "old content 1");
    fs.writeFileSync(path.join(destDir, "subdir", "file2.txt"), "old content 2");

    copyRecursiveSync({ src: srcDir, dest: destDir });

    expect(fs.readFileSync(path.join(destDir, "file1.txt"), "utf8")).toBe("new content 1");
    expect(fs.readFileSync(path.join(destDir, "subdir", "file2.txt"), "utf8")).toBe("new content 2");
  });

  it("should ignore paths in ignoreList", () => {
    const srcDir = path.join(tempDir, "src-ignore");
    const destDir = path.join(tempDir, "dest-ignore");

    fs.mkdirSync(path.join(srcDir, "subdir"), { recursive: true });
    fs.mkdirSync(path.join(srcDir, "ignored-dir"), { recursive: true });
    fs.writeFileSync(path.join(srcDir, "file1.txt"), "content 1");
    fs.writeFileSync(path.join(srcDir, "subdir", "file2.txt"), "content 2");
    fs.writeFileSync(path.join(srcDir, "ignored-dir", "file3.txt"), "content 3");

    copyRecursiveSync({ src: srcDir, dest: destDir, ignoreList: ["ignored-dir"] });

    expect(fs.existsSync(path.join(destDir, "file1.txt"))).toBe(true);
    expect(fs.existsSync(path.join(destDir, "subdir", "file2.txt"))).toBe(true);
    expect(fs.existsSync(path.join(destDir, "ignored-dir"))).toBe(false);
    expect(fs.existsSync(path.join(destDir, "ignored-dir", "file3.txt"))).toBe(false);
  });

  it("should throw if source path does not exist", () => {
    const nonExistentSrc = path.join(tempDir, "non-existent");
    const destDir = path.join(tempDir, "dest-error");
    expect(() => copyRecursiveSync({ src: nonExistentSrc, dest: destDir })).toThrow("does not exist");
  });

  it("should throw if attempting to copy directory to itself or its subdirectory", () => {
    const srcDir = path.join(tempDir, "src-recursion");
    fs.mkdirSync(srcDir, { recursive: true });
    const destDir = path.join(srcDir, "subdir");
    expect(() => copyRecursiveSync({ src: srcDir, dest: destDir })).toThrow("subdirectory of itself");
    expect(() => copyRecursiveSync({ src: srcDir, dest: srcDir })).toThrow("subdirectory of itself");
  });

  it("should throw if copying directory containing symlink pointing outside the source directory", () => {
    const srcDir = path.join(tempDir, "src-symlink");
    const destDir = path.join(tempDir, "dest-symlink");
    fs.mkdirSync(srcDir, { recursive: true });

    // Create an external directory to point to.
    const externalDir = path.join(tempDir, "external-dir");
    fs.mkdirSync(externalDir, { recursive: true });
    fs.writeFileSync(path.join(externalDir, "sensitive.txt"), "sensitive data");

    // Create a symlink (junction on Windows, dir on Unix) inside srcDir pointing to the external dir.
    const symlinkPath = path.join(srcDir, "malicious-symlink");
    try {
      fs.symlinkSync(externalDir, symlinkPath, "junction");
    } catch {
      fs.symlinkSync(externalDir, symlinkPath, "dir");
    }

    expect(() => copyRecursiveSync({ src: srcDir, dest: destDir })).toThrow("Directory traversal detected");
  });

  it("should throw if destination containing symlinks resolves to a subdirectory of source", () => {
    const srcDir = path.join(tempDir, "src-recursion-symlink");
    const subDir = path.join(srcDir, "sub");
    fs.mkdirSync(subDir, { recursive: true });

    const symlinkDir = path.join(tempDir, "symlink-dir");
    fs.mkdirSync(symlinkDir, { recursive: true });
    const symlinkPath = path.join(symlinkDir, "link-to-sub");

    try {
      fs.symlinkSync(subDir, symlinkPath, "junction");
    } catch {
      fs.symlinkSync(subDir, symlinkPath, "dir");
    }

    expect(() => copyRecursiveSync({ src: srcDir, dest: symlinkPath })).toThrow("subdirectory of itself");
  });
});
