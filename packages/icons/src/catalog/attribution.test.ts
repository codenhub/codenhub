import { describe, expect, it } from "vitest";

import type { IconAttribution, IconFamilyData } from "../core/types.js";
import {
  collectAttributedFamilies,
  renderAttributionBanner,
  renderAttributionNotice,
  renderSuppressedAttributionWarning,
} from "./attribution.js";

function createFamily(prefix: string, attribution: IconAttribution): IconFamilyData {
  return {
    icons: { heart: { body: "<path />" } },
    info: {
      attribution,
      author: { name: `${prefix} Authors`, url: `https://${prefix}.test` },
      license: { spdx: "MIT", title: "MIT License", url: `https://${prefix}.test/license` },
      name: prefix,
      tier: attribution === "credit" ? "extended" : "core",
      total: 1,
      upstream: { package: `${prefix}-icons`, version: "2.0.0" },
    },
    prefix,
  };
}

describe("collectAttributedFamilies", () => {
  it("omits families that owe nothing", () => {
    const families = [createFamily("public", "none"), createFamily("permissive", "notice")];

    expect(collectAttributedFamilies(families).map(({ prefix }) => prefix)).toEqual(["permissive"]);
  });

  it("orders the most demanding obligation first", () => {
    const families = [createFamily("permissive", "notice"), createFamily("credited", "credit")];

    expect(collectAttributedFamilies(families).map(({ prefix }) => prefix)).toEqual(["credited", "permissive"]);
  });
});

describe("renderAttributionNotice", () => {
  it("names the family, its version, its license, and its author", () => {
    const notice = renderAttributionNotice([createFamily("permissive", "notice")]);

    expect(notice).toContain("permissive");
    expect(notice).toContain("2.0.0");
    expect(notice).toContain("MIT License (MIT)");
    expect(notice).toContain("https://permissive.test");
  });

  it("returns nothing when every family owes nothing", () => {
    expect(renderAttributionNotice([createFamily("public", "none")])).toBeUndefined();
  });

  it("neutralizes a comment terminator in adopted metadata", () => {
    const family = createFamily("evil", "notice");
    family.info.author.name = "*/ } body { color: red; } /*";

    expect(renderAttributionNotice([family])).not.toContain("*/ }");
  });
});

describe("renderAttributionBanner", () => {
  it("uses the comment form minifiers preserve", () => {
    const banner = renderAttributionBanner([createFamily("permissive", "notice")]);

    expect(banner?.startsWith("/*!")).toBe(true);
    expect(banner?.endsWith("*/")).toBe(true);
  });

  it("returns nothing when there is no obligation to carry", () => {
    expect(renderAttributionBanner([])).toBeUndefined();
  });
});

describe("renderSuppressedAttributionWarning", () => {
  it("names the families that made suppression a problem", () => {
    const warning = renderSuppressedAttributionWarning([
      createFamily("public", "none"),
      createFamily("credited", "credit"),
    ]);

    expect(warning).toContain("credited (MIT)");
    expect(warning).not.toContain("public (MIT)");
  });

  it("stays silent when suppressing notices owes nothing", () => {
    expect(renderSuppressedAttributionWarning([createFamily("public", "none")])).toBeUndefined();
  });
});
