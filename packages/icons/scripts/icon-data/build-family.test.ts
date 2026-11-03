import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildFamily } from "./build-family.ts";
import type { IconFamilyDefinition } from "./family-definitions.ts";
import { ICON_FAMILIES } from "./family-definitions.ts";

const ICON =
  '<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>T</title><path d="M0 0"/></svg>';

const BRAND: IconFamilyDefinition = {
  author: { name: "Logos", url: "https://logos.test" },
  kebabCaseNames: true,
  iconColorsFile: "data/icons.json",
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
    { hex: "181717", slug: "github" },
    { hex: "FFDE00", slug: "hive_chain" },
    { hex: "A50034", slug: "lg" },
    { hex: "A42E2B", license: { type: "GPL-3.0-only" }, slug: "gnu" },
    { hex: "512BD4", license: { type: "CC0-1.0" }, slug: "dotnet" },
  ];
  await writeFile(join(upstream, "data", "icons.json"), JSON.stringify(licenses), "utf8");
});

afterEach(async () => {
  await rm(upstream, { force: true, recursive: true });
});

describe("buildFamily with static artwork", () => {
  const definition: IconFamilyDefinition = {
    ...BRAND,
    staticIconsDirectory: "static",
  };

  beforeEach(async () => {
    await mkdir(join(upstream, "static"));
    await Promise.all(
      ["github", "hive_chain", "dotnet"].map((name) =>
        writeFile(join(upstream, "static", `${name}.svg`), ICON.replace("M0 0", "M1 1"), "utf8"),
      ),
    );
  });

  it("normalizes matching static files under the animated icon's name", async () => {
    const { document } = await buildFamily(definition, upstream, "1");

    expect(document.icons["hive-chain"]?.staticBody).toBe('<path d="M1 1"/>');
    expect(document.icons["hive-chain"]?.body).toBe('<path d="M0 0"/>');
  });

  it("refuses missing static artwork instead of shipping a partial fallback", async () => {
    await rm(join(upstream, "static", "github.svg"));

    await expect(buildFamily(definition, upstream, "1")).rejects.toThrow("github.svg");
  });

  it("refuses static artwork whose viewBox differs from its animated counterpart", async () => {
    await writeFile(join(upstream, "static", "github.svg"), ICON.replace("0 0 24 24", "1 0 24 24"), "utf8");

    await expect(buildFamily(definition, upstream, "1")).rejects.toThrow("viewBox");
  });
});

describe("animated family source layouts", () => {
  it.each([
    { prefix: "line-md", directory: "svg", license: "license.txt", staticDirectory: "svg-static" },
    { prefix: "svg-spinners", directory: "svg-smil", license: "LICENSE", staticDirectory: undefined },
  ])(
    "reads $prefix artwork and its license from the upstream layout",
    async ({ prefix, directory, license, staticDirectory }) => {
      const definition = ICON_FAMILIES.find((family) => family.prefix === prefix);
      expect(definition).toBeDefined();
      if (!definition) {
        return;
      }
      await mkdir(join(upstream, directory));
      const animated = ICON.replace(
        '<path d="M0 0"/>',
        '<path d="M0 0"><animate attributeName="opacity" values="0;1" dur="1s"/></path>',
      );
      await writeFile(join(upstream, directory, "draw.svg"), animated, "utf8");
      await writeFile(join(upstream, license), "MIT", "utf8");
      if (staticDirectory) {
        await mkdir(join(upstream, staticDirectory));
        await writeFile(join(upstream, staticDirectory, "draw.svg"), ICON, "utf8");
      }
      const { document, licenseText } = await buildFamily(definition, upstream, "pinned");

      expect(document.icons.draw.body).toContain("<animate");
      expect(document.icons.draw.staticBody).toBe(staticDirectory ? '<path d="M0 0"/>' : undefined);
      expect(document.info).toMatchObject({ attribution: "notice", tier: "core" });
      expect(licenseText).toBe("MIT");
    },
  );
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

  it("keeps each icon's brand color under its own name, as a lowercase hex color", async () => {
    const { document } = await buildFamily(BRAND, upstream, "1.0.0");

    expect(document.icons.github?.color).toBe("#181717");
    expect(document.icons["hive-chain"]?.color).toBe("#ffde00");
  });

  it("refuses a brand color that is not a six-digit hex value", async () => {
    await writeFile(join(upstream, "data", "icons.json"), JSON.stringify([{ hex: "red", slug: "github" }]), "utf8");

    await expect(buildFamily(BRAND, upstream, "1.0.0")).rejects.toThrow('"github"');
  });

  it("refuses a family license that owes a notice", async () => {
    const definition = { ...BRAND, license: { ...BRAND.license, spdx: "MIT" } };

    await expect(buildFamily(definition, upstream, "1.0.0")).rejects.toThrow("brand tier");
  });
});

describe("buildFamily for an extended family", () => {
  const EXTENDED: IconFamilyDefinition = {
    ...BRAND,
    iconColorsFile: undefined,
    iconLicensesFile: undefined,
    license: { spdx: "CC-BY-4.0", title: "CC BY 4.0", url: "https://logos.test/license" },
    tier: "extended",
  };

  // Only a brand family drops a reserved name; any other tier refuses it.
  beforeEach(async () => {
    await rm(join(upstream, "icons", "lg.svg"));
  });

  it("accepts a license that requires crediting the author", async () => {
    const { document } = await buildFamily(EXTENDED, upstream, "1.0.0");

    expect(document.info.attribution).toBe("credit");
  });

  it("refuses a license that owes no credit", async () => {
    const definition = { ...EXTENDED, license: { ...EXTENDED.license, spdx: "MIT" } };

    await expect(buildFamily(definition, upstream, "1.0.0")).rejects.toThrow("extended tier");
  });
});

describe("buildFamily reserved motion names", () => {
  it("refuses the anim family prefix", async () => {
    await expect(buildFamily({ ...BRAND, prefix: "anim" }, upstream, "1.0.0")).rejects.toThrow(
      'Family prefix "anim" is reserved',
    );
  });

  it.each(["anim", "anim-spin", "anim-custom", "on-hover", "trigger"])("refuses an icon named %s", async (name) => {
    await rm(join(upstream, "icons", "lg.svg"));
    await writeFile(join(upstream, "icons", `${name}.svg`), ICON, "utf8");
    const definition = { ...BRAND, iconColorsFile: undefined, iconLicensesFile: undefined, tier: "core" as const };

    await expect(buildFamily(definition, upstream, "1.0.0")).rejects.toThrow(
      "reserved by the ic-xs–ic-xl size axis or the motion utilities (ic-anim-*, ic-on-hover, ic-trigger)",
    );
  });

  it("drops reserved motion names in brand families and records their exclusion", async () => {
    await writeFile(join(upstream, "icons", "anim-spin.svg"), ICON, "utf8");

    const { attributionText, document } = await buildFamily(BRAND, upstream, "1.0.0");

    expect(document.icons["anim-spin"]).toBeUndefined();
    expect(attributionText).toContain("`anim-spin`");
    expect(attributionText).toContain("ic-anim-*");
  });
});

describe("buildFamily for a multicolor family", () => {
  const MULTICOLOR: IconFamilyDefinition = {
    ...BRAND,
    iconColorsFile: undefined,
    iconLicensesFile: undefined,
    multicolor: true,
    upstreamPackage: "multicolor-logos",
    upstreamRepository: "owner/logos",
  };
  const GRADIENT =
    '<svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid" xmlns="http://www.w3.org/2000/svg"><title>T</title><desc>D</desc><defs><linearGradient id="a"><stop stop-color="#f00" /></linearGradient></defs><path fill="url(#a)" d="M0 0L10.123456 0L10.123456 10Z"/><path fill="#00f" d="M12 12L20 12L20 20Z"/></svg>';

  beforeEach(async () => {
    await rm(join(upstream, "icons"), { force: true, recursive: true });
    await mkdir(join(upstream, "icons"));
    await writeFile(join(upstream, "icons", "socket.io.svg"), GRADIENT, "utf8");
    await writeFile(join(upstream, "icons", "macOS.svg"), GRADIENT, "utf8");
    await writeFile(
      join(upstream, "icons", "styled.svg"),
      '<svg viewBox="0 0 24 24"><style>.a{}</style><path d="M0 0"/></svg>',
      "utf8",
    );
  });

  it("keeps the artwork's own colors and namespaces its ids by icon", async () => {
    const { document } = await buildFamily(MULTICOLOR, upstream, "abc");

    const body = document.icons["socket-io"]?.body;

    expect(body).toContain('id="logos-socket-io-a"');
    expect(body).toContain('fill="url(#logos-socket-io-a)"');
    expect(body).toContain('fill="#00f"');
    expect(document.icons.macos?.body).toContain('id="logos-macos-a"');
    expect(document.icons.macos?.body).toContain('fill="url(#logos-macos-a)"');
  });

  it("rewrites the artwork's paths with coordinates rounded to two decimals", async () => {
    const { document } = await buildFamily(MULTICOLOR, upstream, "abc");

    expect(document.icons["socket-io"]?.body).toContain("10.12");
    expect(document.icons["socket-io"]?.body).not.toContain("10.123");
  });

  it("names icons in kebab case, lowercased", async () => {
    const { document } = await buildFamily(MULTICOLOR, upstream, "abc");

    expect(Object.keys(document.icons).toSorted()).toEqual(["macos", "socket-io"]);
  });

  it("leaves out artwork that cannot render self-contained, and says why", async () => {
    const { attributionText, document } = await buildFamily(MULTICOLOR, upstream, "abc");

    expect(document.icons.styled).toBeUndefined();
    expect(attributionText).toContain("`styled` (a `<style>` element)");
  });

  it("marks the family multicolor and records the repository it came from", async () => {
    const { document } = await buildFamily(MULTICOLOR, upstream, "abc");

    expect(document.info.multicolor).toBe(true);
    expect(document.info.upstream).toEqual({ package: "owner/logos", version: "abc" });
  });

  it("refuses two upstream files that map to one name", async () => {
    await writeFile(join(upstream, "icons", "socket_io.svg"), GRADIENT, "utf8");

    await expect(buildFamily(MULTICOLOR, upstream, "abc")).rejects.toThrow('"socket-io"');
  });
});
