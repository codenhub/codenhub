import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildFamily } from "./build-family.ts";
import type { IconFamilyDefinition } from "./family-definitions.ts";

const ICON =
  '<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>T</title><path d="M0 0"/></svg>';

const BRAND: IconFamilyDefinition = {
  author: { name: "Logos", url: "https://logos.test" },
  hyphenateNames: true,
  iconLicensesFile: "data/icons.json",
  iconsDirectory: "icons",
  license: { spdx: "CC0-1.0", title: "CC0 1.0 Universal", url: "https://logos.test/license" },
  licenseFile: "LICENSE",
  name: "Logos",
  prefix: "logos",
  tier: "brand",
  upstreamPackage: "logos",
};

let upstream: string;

beforeEach(async () => {
  upstream = await mkdtemp(join(tmpdir(), "icons-brand-"));
  await mkdir(join(upstream, "icons"));
  await mkdir(join(upstream, "data"));
  await writeFile(join(upstream, "LICENSE"), "CC0", "utf8");
  await Promise.all(
    ["github", "hive_chain", "lg", "gnu", "dotnet"].map((slug) =>
      writeFile(join(upstream, "icons", `${slug}.svg`), ICON, "utf8"),
    ),
  );
  const licenses = [
    { slug: "github" },
    { slug: "hive_chain" },
    { slug: "lg" },
    { license: { type: "GPL-3.0-only" }, slug: "gnu" },
    { license: { type: "CC0-1.0" }, slug: "dotnet" },
  ];
  await writeFile(join(upstream, "data", "icons.json"), JSON.stringify(licenses), "utf8");
});

afterEach(async () => {
  await rm(upstream, { force: true, recursive: true });
});

describe("buildFamily for a brand family", () => {
  it("keeps only icons whose own license owes nothing", async () => {
    const { document } = await buildFamily(BRAND, upstream, "1.0.0");

    expect(Object.keys(document.icons).toSorted()).toEqual(["dotnet", "github", "hive-chain"]);
  });

  it("drops a reserved name instead of refusing the family, and says so", async () => {
    const { attributionText, document } = await buildFamily(BRAND, upstream, "1.0.0");

    expect(document.icons.lg).toBeUndefined();
    expect(attributionText).toContain("reserves the name: `lg`");
    expect(attributionText).toContain("1 upstream icon(s) carry a license of their own");
  });

  it("states in its attribution that the marks belong to their owners", async () => {
    const { attributionText } = await buildFamily(BRAND, upstream, "1.0.0");

    expect(attributionText).toContain("trademarks of their owners");
  });

  it("refuses a family license that owes a notice", async () => {
    const definition = { ...BRAND, license: { ...BRAND.license, spdx: "MIT" } };

    await expect(buildFamily(definition, upstream, "1.0.0")).rejects.toThrow("brand tier");
  });
});
