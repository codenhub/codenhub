import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { parseFrontmatter, getSkills, copyRecursiveSync, confirmPrompt, selectPrompt } from "./cli.js";

describe("Skills Helper functions", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codenhub-skills-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("parseFrontmatter", () => {
    it("should parse valid frontmatter", () => {
      const content = `---\nname: test-skill\ndescription: A test skill description\n---\nSome markdown here`;
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
  });

  describe("getSkills", () => {
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
    it("should recursively copy files and folders", () => {
      const srcDir = path.join(tempDir, "src");
      const destDir = path.join(tempDir, "dest");

      fs.mkdirSync(path.join(srcDir, "subdir"), { recursive: true });
      fs.writeFileSync(path.join(srcDir, "file1.txt"), "content 1");
      fs.writeFileSync(path.join(srcDir, "subdir", "file2.txt"), "content 2");

      copyRecursiveSync(srcDir, destDir);

      expect(fs.existsSync(path.join(destDir, "file1.txt"))).toBe(true);
      expect(fs.readFileSync(path.join(destDir, "file1.txt"), "utf8")).toBe("content 1");
      expect(fs.existsSync(path.join(destDir, "subdir", "file2.txt"))).toBe(true);
      expect(fs.readFileSync(path.join(destDir, "subdir", "file2.txt"), "utf8")).toBe("content 2");
    });

    it("should ignore paths in ignoreList", () => {
      const srcDir = path.join(tempDir, "src-ignore");
      const destDir = path.join(tempDir, "dest-ignore");

      fs.mkdirSync(path.join(srcDir, "subdir"), { recursive: true });
      fs.mkdirSync(path.join(srcDir, "ignored-dir"), { recursive: true });
      fs.writeFileSync(path.join(srcDir, "file1.txt"), "content 1");
      fs.writeFileSync(path.join(srcDir, "subdir", "file2.txt"), "content 2");
      fs.writeFileSync(path.join(srcDir, "ignored-dir", "file3.txt"), "content 3");

      copyRecursiveSync(srcDir, destDir, ["ignored-dir"]);

      expect(fs.existsSync(path.join(destDir, "file1.txt"))).toBe(true);
      expect(fs.existsSync(path.join(destDir, "subdir", "file2.txt"))).toBe(true);
      expect(fs.existsSync(path.join(destDir, "ignored-dir"))).toBe(false);
      expect(fs.existsSync(path.join(destDir, "ignored-dir", "file3.txt"))).toBe(false);
    });
  });

  describe("confirmPrompt", () => {
    it("should return default value when process.stdin.isTTY is false", async () => {
      const origIsTTY = process.stdin.isTTY;
      process.stdin.isTTY = false;
      try {
        const result = await confirmPrompt("Test message", true);
        expect(result).toBe(true);
        const resultFalse = await confirmPrompt("Test message", false);
        expect(resultFalse).toBe(false);
      } finally {
        process.stdin.isTTY = origIsTTY;
      }
    });
  });

  describe("selectPrompt", () => {
    it("should return the first choice value when process.stdin.isTTY is false", async () => {
      const origIsTTY = process.stdin.isTTY;
      process.stdin.isTTY = false;
      try {
        const choices = [
          { name: "Choice A", value: "a" },
          { name: "Choice B", value: "b" },
        ];
        const result = await selectPrompt("Test select", choices);
        expect(result).toBe("a");
      } finally {
        process.stdin.isTTY = origIsTTY;
      }
    });
  });
});
