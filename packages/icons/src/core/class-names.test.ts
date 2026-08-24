import { describe, expect, it } from "vitest";

import { resolveIconClassName } from "./class-names.js";
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

describe("resolveIconClassName", () => {
  it("resolves a dashed family prefix a class name cannot write with a colon", () => {
    const registry = new IconRegistry();
    registry.registerFamily(createFamily("lucide", ["arrow-right"]));

    expect(resolveIconClassName(registry, "lucide-arrow-right")?.name).toBe("lucide:arrow-right");
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

  it("returns undefined when no reading of the name resolves", () => {
    const registry = new IconRegistry();
    registry.registerFamily(createFamily("lucide", ["heart"]));

    expect(resolveIconClassName(registry, "lucide-absent")).toBeUndefined();
    expect(resolveIconClassName(registry, "after")).toBeUndefined();
  });
});
