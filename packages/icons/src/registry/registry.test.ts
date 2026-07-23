import { describe, expect, it } from "vitest";

import { lucideProvider } from "./providers/lucide.js";
import { IconRegistry } from "./registry.js";

describe("IconRegistry", () => {
  it("should register and resolve individual icons", () => {
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

  it("should handle icon aliases from alt array", () => {
    const registry = new IconRegistry();
    registry.registerIcon("x", {
      svg: "<svg>x</svg>",
      alt: ["close", "cancel"],
    });

    expect(registry.has("close")).toBe(true);
    expect(registry.has("cancel")).toBe(true);
    expect(registry.resolve("close")?.svg).toBe("<svg>x</svg>");
    expect(registry.resolve("cancel")?.svg).toBe("<svg>x</svg>");
  });

  it("should register and resolve from icon set", () => {
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
  });

  it("should resolve icons using dynamic provider", () => {
    const registry = new IconRegistry();
    registry.registerProvider(lucideProvider);

    expect(registry.has("close")).toBe(true);
    expect(registry.has("search")).toBe(true);

    const closeIcon = registry.resolve("close");
    expect(closeIcon?.svg).toContain("<svg");
    expect(closeIcon?.primaryName).toBe("x");
  });

  it("should list registered primary icons", () => {
    const registry = new IconRegistry();
    registry.registerIcon("first", "<svg>1</svg>");
    registry.registerIcon("second", "<svg>2</svg>");

    const list = registry.list("lucide");
    expect(list).toContain("first");
    expect(list).toContain("second");
  });
});
