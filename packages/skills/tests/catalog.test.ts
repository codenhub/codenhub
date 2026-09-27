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
});
