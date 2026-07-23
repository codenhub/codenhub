import { describe, expect, it } from "vitest";

import { lucideProvider } from "../src/registry/providers/lucide.js";
import { IconRegistry } from "../src/registry/registry.js";
import type { IconProvider } from "../src/registry/types.js";

describe("IconRegistry", () => {
  it("initializes with default or custom options", () => {
    const registry = new IconRegistry();
    expect(registry.list("lucide")).toEqual([]);

    const customRegistry = new IconRegistry({ defaultPrefix: "custom" });
    expect(customRegistry.list("custom")).toEqual([]);
  });

  it("registers a single icon with raw string SVG", () => {
    const registry = new IconRegistry({ defaultPrefix: "custom" });
    const svg = '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>';

    registry.registerIcon("star", svg);

    expect(registry.has("star")).toBe(true);
    expect(registry.get("star")).toEqual({ svg });
    expect(registry.resolve("star")).toEqual({
      name: "custom:star",
      primaryName: "star",
      prefix: "custom",
      svg,
    });
  });

  it("registers an icon with IconDefinition and alt aliases", () => {
    const registry = new IconRegistry({ defaultPrefix: "custom" });
    const svg =
      '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';

    registry.registerIcon("x", {
      svg,
      alt: ["close", "cancel", "times"],
    });

    expect(registry.has("x")).toBe(true);
    expect(registry.has("close")).toBe(true);
    expect(registry.has("cancel")).toBe(true);
    expect(registry.has("times")).toBe(true);

    expect(registry.get("close")).toEqual({ svg });
    expect(registry.resolve("close")).toEqual({
      name: "custom:x",
      primaryName: "x",
      prefix: "custom",
      svg,
    });
  });

  it("registers an IconSet with icons and alias map", () => {
    const registry = new IconRegistry();
    const svgUser = "<svg><path d='user'/></svg>";
    const svgSettings = "<svg><path d='settings'/></svg>";

    registry.registerSet({
      prefix: "app",
      icons: {
        account: svgUser,
        cog: svgSettings,
      },
      aliases: {
        profile: "account",
        preferences: "cog",
      },
    });

    expect(registry.has("app:account")).toBe(true);
    expect(registry.has("app:profile")).toBe(true);
    expect(registry.get("app:profile")).toEqual({ svg: svgUser });
    expect(registry.resolve("app:preferences")).toEqual({
      name: "app:cog",
      primaryName: "cog",
      prefix: "app",
      svg: svgSettings,
    });

    expect(registry.list("app")).toEqual(["account", "cog"]);
  });

  it("falls back to registered IconProvider when icon is not registered in-memory", () => {
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

    // Verify provider-fetched icon gets registered locally
    expect(registry.list("dynamic")).toContain("heart");
  });

  it("works with built-in lucideProvider", () => {
    const registry = new IconRegistry();
    registry.registerProvider(lucideProvider);

    expect(registry.has("close")).toBe(true);
    expect(registry.has("x")).toBe(true);
    expect(registry.has("check")).toBe(true);
    expect(registry.has("search")).toBe(true);

    const resolvedClose = registry.resolve("close");
    expect(resolvedClose).toBeDefined();
    expect(resolvedClose?.prefix).toBe("lucide");
    expect(resolvedClose?.svg).toContain("<svg");
  });

  it("returns undefined for non-existent icons", () => {
    const registry = new IconRegistry();
    expect(registry.get("non-existent-icon-xyz")).toBeUndefined();
    expect(registry.resolve("non-existent-icon-xyz")).toBeUndefined();
    expect(registry.has("non-existent-icon-xyz")).toBe(false);
  });
});
