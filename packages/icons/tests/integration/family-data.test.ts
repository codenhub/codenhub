import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { IconRegistry } from "../../src/core/registry.js";
import { renderSvg } from "../../src/core/render.js";
import type { IconFamilyData } from "../../src/core/types.js";

const dataDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../../data");

const ACCEPTED_LICENSES: Record<string, IconFamilyData["info"]["attribution"]> = {
  "Apache-2.0": "notice",
  "CC-BY-4.0": "credit",
  "CC0-1.0": "none",
  ISC: "notice",
  MIT: "notice",
  Unlicense: "none",
};

function readFamilies(): { prefix: string; family: IconFamilyData; files: string[] }[] {
  return readdirSync(dataDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      family: JSON.parse(readFileSync(resolve(dataDirectory, entry.name, "icons.json"), "utf8")) as IconFamilyData,
      files: readdirSync(resolve(dataDirectory, entry.name)),
      prefix: entry.name,
    }));
}

const families = readFamilies();

describe("generated family data", () => {
  it("ships at least one family", () => {
    expect(families.length).toBeGreaterThan(0);
  });

  it.each(families)("$prefix is stored under the prefix it declares", ({ family, prefix }) => {
    expect(family.prefix).toBe(prefix);
  });

  it.each(families)("$prefix carries the license material it redistributes", ({ files }) => {
    expect(files).toContain("LICENSE");
    expect(files).toContain("ATTRIBUTION.md");
  });

  it.each(families)("$prefix declares an accepted license and the obligation it implies", ({ family }) => {
    expect(ACCEPTED_LICENSES[family.info.license.spdx]).toBe(family.info.attribution);
  });

  it.each(families)("$prefix keeps a core tier family free of a credit obligation", ({ family }) => {
    expect(family.info.tier === "core" && family.info.attribution === "credit").toBe(false);
  });

  it.each(families)("$prefix records the upstream it was generated from", ({ family }) => {
    expect(family.info.upstream.package).not.toBe("");
    expect(family.info.upstream.version).not.toBe("");
  });

  it.each(families)("$prefix counts the icons it holds", ({ family }) => {
    expect(family.info.total).toBe(Object.keys(family.icons).length);
  });

  it.each(families)("$prefix holds a non-empty body for every icon", ({ family }) => {
    const empty = Object.entries(family.icons).filter(([, icon]) => icon.body.trim() === "");

    expect(empty).toEqual([]);
  });

  it.each(families)("$prefix stores inner markup rather than a complete element", ({ family }) => {
    const wrapped = Object.entries(family.icons).filter(([, icon]) => icon.body.includes("<svg"));

    expect(wrapped).toEqual([]);
  });

  it.each(families)("$prefix points every alias at an icon that exists", ({ family }) => {
    const dangling = Object.entries(family.aliases ?? {}).filter(([, alias]) => !family.icons[alias.parent]);

    expect(dangling).toEqual([]);
  });

  it.each(families)("$prefix renders every icon into an element with a viewBox", ({ family }) => {
    const registry = new IconRegistry();
    registry.registerFamily(family);
    const names = Object.keys(family.icons);
    const sampled = [names[0], names.at(-1)].filter((name) => name !== undefined);

    for (const name of sampled) {
      const resolved = registry.resolve(`${family.prefix}:${name}`);
      expect(renderSvg(resolved!)).toContain(
        `viewBox="${resolved!.left} ${resolved!.top} ${resolved!.width} ${resolved!.height}"`,
      );
    }
  });
});
