import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import { describe, expect, it } from "vitest";

import { getSkills, parseFrontmatter } from "../src/index.js";

/**
 * The catalog is kept by hand in several places: the skill directories, the
 * inventory in docs/skills.md, the provenance table, and per-skill NOTICE
 * files. These tests keep them saying the same thing.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skills = getSkills(path.join(root, "skills"));
const drafts = getSkills(path.join(root, "drafts"));

/** Skill IDs from the first column of a doc's Markdown tables. */
const tableIds = (doc: string) =>
  [...fs.readFileSync(path.join(root, "docs", doc), "utf8").matchAll(/^\| `([^`]+)` +\|/gm)].map((m) => m[1]);

const provenance = new Map(
  [...fs.readFileSync(path.join(root, "docs", "provenance.md"), "utf8").matchAll(/^\| `([^`]+)` +\| ([^|]+)\|/gm)].map(
    (m) => [m[1], m[2].trim()],
  ),
);

/** Top-level frontmatter keys the Agent Skills specification defines. */
const specKeys = new Set(["name", "description", "license", "compatibility", "metadata", "allowed-tools"]);

/** Top-level directories a skill may hold beside `SKILL.md`, its notices, and harness metadata in `agents/`. */
const layout = new Set(["SKILL.md", "NOTICE", "LICENSE", "agents", "references", "scripts", "assets"]);

const read = (file: string) => fs.readFileSync(file, "utf8");

/** Every file under `dir`, as paths relative to it with forward slashes. */
const walk = (dir: string): string[] =>
  fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"));

/** Splits `SKILL.md` into its raw frontmatter and its body. */
const split = (content: string) => {
  const match = content.match(/^\uFEFF?---\r?\n([\s\S]+?)\r?\n---\r?\n?/);
  return { frontmatter: match?.[1] ?? "", body: match ? content.slice(match[0].length) : content };
};

/**
 * Paths into the skill that a Markdown file references: relative link targets, and code spans naming a file under
 * one of the specification's directories. Code spans elsewhere usually name files in the user's project instead.
 */
const references = (markdown: string) => [
  ...[...markdown.matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)]
    .map((m) => m[1])
    .filter((target) => !/^[a-z]+:/i.test(target)),
  ...[...markdown.matchAll(/`((?:references|scripts|assets)\/[^`\s]+)`/g)].map((m) => m[1]),
];

describe("skill catalog", () => {
  it("should hold bundled skills", () => {
    expect(skills.length).toBeGreaterThan(0);
  });

  // The Agent Skills format: a lowercase, hyphenated name of at most 64 characters matching the directory,
  // and a description of at most 1024 characters.
  it.each([...skills, ...drafts].map((skill) => [skill.id, skill]))("should give %s valid metadata", (_, skill) => {
    const meta = parseFrontmatter(fs.readFileSync(path.join(skill.path, "SKILL.md"), "utf8"));
    expect(meta.name).toBe(skill.id);
    expect(skill.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(skill.id.length).toBeLessThanOrEqual(64);
    expect(skill.description.length).toBeGreaterThan(0);
    expect(skill.description.length).toBeLessThanOrEqual(1024);
  });

  it("should list every bundled skill, and only those, in the inventory", () => {
    expect(tableIds("skills.md").toSorted()).toEqual(skills.map((skill) => skill.id).toSorted());
  });

  it("should record the provenance of every bundled skill, and only those", () => {
    expect([...provenance.keys()].toSorted()).toEqual(skills.map((skill) => skill.id).toSorted());
  });

  it("should ship a NOTICE with every adapted skill", () => {
    const adapted = [...provenance].filter(([, origin]) => origin.startsWith("Adapted from")).map(([id]) => id);
    expect(adapted.filter((id) => !fs.existsSync(path.join(root, "skills", id, "NOTICE")))).toEqual([]);
  });

  it("should keep drafts apart from the bundled skills", () => {
    const ids = new Set(skills.map((skill) => skill.id));
    expect(drafts.filter((draft) => ids.has(draft.id)).map((draft) => draft.id)).toEqual([]);
  });

  describe.each(skills.map((skill) => [skill.id, skill]))("%s", (_, skill) => {
    const skillMd = read(path.join(skill.path, "SKILL.md"));
    const { frontmatter, body } = split(skillMd);
    const meta = parseFrontmatter(skillMd);
    const files = walk(skill.path);

    it("should use only the frontmatter keys the specification defines", () => {
      const keys = [...frontmatter.matchAll(/^([A-Za-z][\w-]*):/gm)].map((m) => m[1]);
      expect(keys.filter((key) => !specKeys.has(key))).toEqual([]);
    });

    // Reserved words and XML tags are rejected by Anthropic's skill loaders; a folded or literal block scalar is not
    // understood by the package's flat frontmatter parser, which would read the indicator as the description.
    it("should keep name and description loadable by every harness", () => {
      expect(meta.name).not.toMatch(/anthropic|claude/);
      expect(`${meta.name} ${meta.description}`).not.toMatch(/<\/?[a-z][^>]*>/i);
      expect(meta.description).not.toMatch(/^[>|][+-]?$/);
    });

    it("should keep the SKILL.md body under 500 lines", () => {
      expect(body.split("\n").length).toBeLessThan(500);
    });

    it("should hold only the specification's directories", () => {
      expect(fs.readdirSync(skill.path).filter((entry) => !layout.has(entry))).toEqual([]);
    });

    // The installer copies one skill directory, so a reference must name a file inside it.
    it("should reference only files inside the skill, with forward slashes", () => {
      const targets = references(body);
      expect(targets.filter((target) => target.includes("\\"))).toEqual([]);
      const root = path.resolve(skill.path);
      const outside = targets.filter((target) => {
        const resolved = path.resolve(root, target);
        const relative = path.relative(root, resolved);
        return (
          relative === ".." ||
          relative.startsWith(`..${path.sep}`) ||
          path.isAbsolute(relative) ||
          !fs.statSync(resolved, { throwIfNoEntry: false })?.isFile()
        );
      });
      expect(outside).toEqual([]);
    });

    it("should load every reference file from SKILL.md", () => {
      const targets = new Set(references(body).map((target) => path.posix.normalize(target)));
      expect(files.filter((file) => file.startsWith("references/") && !targets.has(file))).toEqual([]);
    });

    // Agents may only preview a file reached through another reference, so references stay one level deep.
    it("should keep reference files one level deep", () => {
      const nested = files
        .filter((file) => file.startsWith("references/") && file.endsWith(".md"))
        .filter((file) => references(read(path.join(skill.path, file))).length > 0);
      expect(nested).toEqual([]);
    });

    it("should open long reference files with a contents section", () => {
      const long = files
        .filter((file) => file.startsWith("references/") && file.endsWith(".md"))
        .filter((file) => {
          const content = read(path.join(skill.path, file));
          return content.split("\n").length > 100 && !/^## Contents$/m.test(content);
        });
      expect(long).toEqual([]);
    });

    it("should describe itself to Codex in agents/openai.yaml", () => {
      const yaml = path.join(skill.path, "agents", "openai.yaml");
      expect(fs.existsSync(yaml)).toBe(true);
      for (const key of ["display_name", "short_description", "default_prompt"]) {
        expect(read(yaml)).toMatch(new RegExp(`^  ${key}:`, "m"));
      }
    });
  });
});
