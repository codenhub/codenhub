import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { IconFamilyData } from "../../src/core/types.js";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dataDirectory = resolve(packageDirectory, "data");
const twEntryPath = resolve(packageDirectory, "dist", "tw", "index.css");

function readFamilies(): IconFamilyData[] {
  return readdirSync(dataDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map(
      (entry) => JSON.parse(readFileSync(resolve(dataDirectory, entry.name, "icons.json"), "utf8")) as IconFamilyData,
    );
}

// The entry point is emitted by scripts/build-css.mjs, so it only exists after a
// build. `pnpm verify` builds before it tests; a bare `pnpm test` need not, and
// this suite is skipped rather than failed when the artifact is absent.
describe.skipIf(!existsSync(twEntryPath))("dist/tw/index.css", () => {
  const css = existsSync(twEntryPath) ? readFileSync(twEntryPath, "utf8") : "";
  const families = readFamilies();

  it("declares the Tailwind plugin", () => {
    expect(css).toContain('@plugin "@codenhub/icons/tailwind";');
  });

  it("opens with a preserved license banner before the plugin declaration", () => {
    const banner = css.indexOf("/*!\nIcon artwork in this build:");
    expect(banner).toBeGreaterThanOrEqual(0);
    expect(banner).toBeLessThan(css.indexOf('@plugin "@codenhub/icons/tailwind";'));
  });

  it.each(families)("names $prefix and its license in the banner", (family) => {
    expect(css).toContain(family.info.name);
    expect(css).toContain(family.info.license.spdx);
    expect(css).toContain(family.info.upstream.version);
  });
});
