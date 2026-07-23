import { describe, expect, it } from "vitest";

import { lucideProvider } from "./providers/lucide.js";
import { IconRegistry } from "./registry.js";
import type { IconProvider } from "./types.js";

describe("IconRegistry", () => {
  it("initializes with default or custom options", () => {
    const registry = new IconRegistry();
    expect(registry.list("lucide")).toEqual([]);

    const customRegistry = new IconRegistry({ defaultPrefix: "custom" });
    expect(customRegistry.list("custom")).toEqual([]);
  });

  it("registers and resolves individual icons", () => {
    const registry = new IconRegistry();
    registry.registerIcon("test-icon", "<svg>test</svg>");

    expect(registry.has("test-icon")).toBe(true);
    const resolved = registry.resolve("test-icon");
    expect(resolved).toEqual({
      name: "lucide:test-icon",
      primaryName: "test-icon",
      prefix: "lucide",
      svg: "<svg>test</svg>",
    });
  });

  it("handles icon aliases from alt array", () => {
    const registry = new IconRegistry();
    registry.registerIcon("x", {
      svg: "<svg>x</svg>",
      alt: ["close", "cancel"],
    });

    expect(registry.has("close")).toBe(true);
    expect(registry.has("cancel")).toBe(true);
    expect(registry.get("close")).toEqual({ svg: "<svg>x</svg>" });
    expect(registry.resolve("close")?.svg).toBe("<svg>x</svg>");
    expect(registry.resolve("cancel")?.svg).toBe("<svg>x</svg>");
  });

  it("registers and resolves from icon set", () => {
    const registry = new IconRegistry();
    registry.registerSet({
      prefix: "custom",
      icons: {
        star: "<svg>star</svg>",
      },
      aliases: {
        favorite: "star",
      },
    });

    expect(registry.has("custom:star")).toBe(true);
    expect(registry.has("custom:favorite")).toBe(true);
    expect(registry.resolve("custom:favorite")?.svg).toBe("<svg>star</svg>");
    expect(registry.list("custom")).toEqual(["star"]);
  });

  it("resolves icons using dynamic provider and handles provider fallback", () => {
    const registry = new IconRegistry({ defaultPrefix: "dynamic" });
    const customProvider: IconProvider = {
      prefix: "dynamic",
      getIcon(name: string) {
        if (name === "heart" || name === "like") {
          return {
            svg: "<svg><path d='heart'/></svg>",
            alt: ["like"],
          };
        }
        return undefined;
      },
    };

    registry.registerProvider(customProvider);

    expect(registry.has("dynamic:heart")).toBe(true);
    expect(registry.resolve("heart")).toEqual({
      name: "dynamic:heart",
      primaryName: "heart",
      prefix: "dynamic",
      svg: "<svg><path d='heart'/></svg>",
    });
    expect(registry.list("dynamic")).toContain("heart");
  });

  it("works with built-in lucideProvider", () => {
    const registry = new IconRegistry();
    registry.registerProvider(lucideProvider);

    expect(registry.has("close")).toBe(true);
    expect(registry.has("x")).toBe(true);
    expect(registry.has("check")).toBe(true);
    expect(registry.has("search")).toBe(true);

    const closeIcon = registry.resolve("close");
    expect(closeIcon?.svg).toContain("<svg");
    expect(closeIcon?.primaryName).toBe("x");
  });

  it("returns undefined for non-existent icons", () => {
    const registry = new IconRegistry();
    expect(registry.get("non-existent-icon-xyz")).toBeUndefined();
    expect(registry.resolve("non-existent-icon-xyz")).toBeUndefined();
    expect(registry.has("non-existent-icon-xyz")).toBe(false);
  });
});
