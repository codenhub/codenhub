import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { IconFamilyData } from "../../src/core/types.js";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dataDirectory = resolve(packageDirectory, "data");
const cssDirectory = resolve(packageDirectory, "dist", "css");

function readFamilies(): IconFamilyData[] {
  return readdirSync(dataDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map(
      (entry) => JSON.parse(readFileSync(resolve(dataDirectory, entry.name, "icons.json"), "utf8")) as IconFamilyData,
    );
}

function readStylesheet(family: IconFamilyData): string {
  return readFileSync(resolve(cssDirectory, `${family.prefix}.css`), "utf8");
}

// The stylesheets are emitted by scripts/build-css.mjs, so they only exist after
// a build; the suite is skipped rather than failed when they are absent.
describe.skipIf(!existsSync(cssDirectory))("dist/css family stylesheets", () => {
  const families = readFamilies();
  const firstIcon = (family: IconFamilyData): string => Object.keys(family.icons)[0];

  it("gives a core family's icons their bare names", () => {
    const core = families.filter((family) => family.info.tier !== "brand");
    expect(core.length).toBeGreaterThan(0);
    for (const family of core) {
      expect(readStylesheet(family)).toMatch(new RegExp(`\\n\\.ic-${firstIcon(family)},? `));
    }
  });

  // A brand family that answered to bare names would take `ic-x` or `ic-play`
  // from a core family imported before it and draw a company's logo instead.
  it("gives a brand family's icons only their qualified names", () => {
    const brand = families.filter((family) => family.info.tier === "brand");
    expect(brand.length).toBeGreaterThan(0);
    for (const family of brand) {
      const css = readStylesheet(family);
      const selectors = css.match(/^\.[^\s{,]+/gm) ?? [];
      expect(selectors.length).toBeGreaterThan(0);
      expect(selectors.filter((selector) => !selector.startsWith(`.ic-${family.prefix}-`))).toEqual([]);
    }
  });
});
