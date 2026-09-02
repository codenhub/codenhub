import { describe, expect, it } from "vitest";

import { parseIconClass, resolveIconClassName } from "./class-names.js";
import { IconRegistry } from "./registry.js";
import type { IconFamilyData } from "./types.js";

function createFamily(prefix: string, iconNames: string[]): IconFamilyData {
  return {
    icons: Object.fromEntries(iconNames.map((name) => [name, { body: `<path d="${name}" />` }])),
    info: {
      attribution: "none",
      author: { name: "Test Author", url: "https://example.test" },
      license: { spdx: "CC0-1.0", title: "CC0 1.0", url: "https://example.test/license" },
      name: prefix,
      tier: "core",
      total: iconNames.length,
      upstream: { package: "test-icons", version: "1.0.0" },
    },
    prefix,
  };
}

describe("parseIconClass", () => {
  it("reads a name that carries no modifier", () => {
    expect(parseIconClass("lucide-heart")).toEqual({ name: "lucide-heart" });
  });

  it("reads a fractional stroke modifier off the end of the name", () => {
    expect(parseIconClass("lucide-heart/1.5")).toEqual({ name: "lucide-heart", strokeWidth: "1.5" });
  });

  it("reads a whole-number stroke modifier", () => {
    expect(parseIconClass("heart/2")).toEqual({ name: "heart", strokeWidth: "2" });
  });

  it("keeps a trailing segment that is not a number as part of the name", () => {
    // Only a number is a stroke width. Anything else stays in the name and
    // fails to resolve as an icon, rather than silently losing a segment.
    expect(parseIconClass("heart/thin")).toEqual({ name: "heart/thin" });
  });

  it("reads the last separator, so an earlier slash stays in the name", () => {
    expect(parseIconClass("set/heart/1.5")).toEqual({ name: "set/heart", strokeWidth: "1.5" });
  });
});

describe("resolveIconClassName", () => {
  it("resolves a dashed family prefix a class name cannot write with a colon", () => {
    const registry = new IconRegistry();
    registry.registerFamily(createFamily("lucide", ["arrow-right"]));

    expect(resolveIconClassName(registry, "lucide-arrow-right")?.name).toBe("lucide:arrow-right");
  });

  it("resolves a qualified name already written with a colon", () => {
    const registry = new IconRegistry();
    registry.registerFamily(createFamily("lucide", ["heart"]));

    expect(resolveIconClassName(registry, "lucide:heart")?.name).toBe("lucide:heart");
  });

  it("prefers the longest matching family prefix", () => {
    const registry = new IconRegistry();
    registry.registerFamily(createFamily("material", ["symbols-home"]));
    registry.registerFamily(createFamily("material-symbols", ["home"]));

    expect(resolveIconClassName(registry, "material-symbols-home")?.prefix).toBe("material-symbols");
  });

  it("prefers a direct resolution over a dashed prefix reading", () => {
    const registry = new IconRegistry({ defaultPrefix: "lucide" });
    registry.registerFamily(createFamily("lucide", ["star-half"]));
    registry.registerFamily(createFamily("star", ["half"]));

    expect(resolveIconClassName(registry, "star-half")?.prefix).toBe("lucide");
  });

  it("does not resolve an unqualified name without a default prefix", () => {
    const registry = new IconRegistry();
    registry.registerFamily(createFamily("lucide", ["heart"]));

    expect(resolveIconClassName(registry, "heart")).toBeUndefined();
  });

  it("returns undefined when no reading of the name resolves", () => {
    const registry = new IconRegistry();
    registry.registerFamily(createFamily("lucide", ["heart"]));

    expect(resolveIconClassName(registry, "lucide-absent")).toBeUndefined();
    expect(resolveIconClassName(registry, "after")).toBeUndefined();
  });
});
