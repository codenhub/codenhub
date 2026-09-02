import { describe, expect, it } from "vitest";

import { IconRegistry } from "./registry.js";
import type { IconFamilyData } from "./types.js";

function createFamily(overrides: Partial<IconFamilyData> = {}): IconFamilyData {
  return {
    aliases: { cancel: { parent: "x" } },
    height: 24,
    icons: {
      heart: { body: "<path d='heart' />" },
      "large-mark": { body: "<path d='large' />", height: 48, width: 48 },
      x: { body: "<path d='x' />" },
    },
    info: {
      attribution: "notice",
      author: { name: "Test Author", url: "https://example.test" },
      license: { spdx: "MIT", title: "MIT License", url: "https://example.test/license" },
      name: "Test Family",
      strokeWidth: 2,
      tier: "core",
      total: 3,
      upstream: { package: "test-icons", version: "1.0.0" },
    },
    prefix: "test",
    width: 24,
    ...overrides,
  };
}

describe("IconRegistry", () => {
  it("resolves a qualified name against a registered family", () => {
    const registry = new IconRegistry();
    registry.registerFamily(createFamily());

    expect(registry.resolve("test:heart")).toEqual({
      body: "<path d='heart' />",
      height: 24,
      iconName: "heart",
      left: 0,
      name: "test:heart",
      prefix: "test",
      strokeWidth: 2,
      top: 0,
      width: 24,
    });
  });

  it("does not resolve an unqualified name without a default prefix", () => {
    const registry = new IconRegistry();
    registry.registerFamily(createFamily());

    expect(registry.resolve("heart")).toBeUndefined();
  });

  it("resolves an unprefixed name against the configured default prefix", () => {
    const registry = new IconRegistry({ defaultPrefix: "test" });
    registry.registerFamily(createFamily());

    expect(registry.resolve("heart")?.name).toBe("test:heart");
  });

  it("resolves a family alias to its parent icon", () => {
    const registry = new IconRegistry();
    registry.registerFamily(createFamily());

    const resolved = registry.resolve("test:cancel");
    expect(resolved?.iconName).toBe("x");
    expect(resolved?.name).toBe("test:x");
  });

  it("uses per-icon geometry when it differs from the family default", () => {
    const registry = new IconRegistry();
    registry.registerFamily(createFamily());

    expect(registry.resolve("test:large-mark")).toMatchObject({ height: 48, width: 48 });
  });

  it("takes the viewBox origin from the family when an icon does not override it", () => {
    const registry = new IconRegistry();
    registry.registerFamily(createFamily({ top: -960 }));

    expect(registry.resolve("test:heart")).toMatchObject({ left: 0, top: -960 });
  });

  it("omits stroke width for a family that is not stroke-based", () => {
    const family = createFamily();
    const filledInfo = { ...family.info };
    delete filledInfo.strokeWidth;
    const registry = new IconRegistry();
    registry.registerFamily({ ...family, info: filledInfo });

    expect(registry.resolve("test:heart")).not.toHaveProperty("strokeWidth");
  });

  it("replaces a family registered under the same prefix", () => {
    const registry = new IconRegistry();
    registry.registerFamily(createFamily());
    registry.registerFamily(createFamily({ icons: { heart: { body: "<path d='override' />" } } }));

    expect(registry.resolve("test:heart")?.body).toBe("<path d='override' />");
    expect(registry.resolve("test:x")).toBeUndefined();
  });

  it("does not resolve a family that is only registered as a loader", () => {
    const registry = new IconRegistry();
    registry.registerLoader("test", async () => createFamily());

    expect(registry.resolve("test:heart")).toBeUndefined();
  });

  it("loads a family on demand when resolving asynchronously", async () => {
    const registry = new IconRegistry();
    registry.registerLoader("test", async () => createFamily());

    await expect(registry.resolveAsync("test:heart")).resolves.toMatchObject({ name: "test:heart" });
    expect(registry.resolve("test:heart")?.name).toBe("test:heart");
  });

  it("accepts a loader returning a module namespace", async () => {
    const registry = new IconRegistry();
    registry.registerLoader("test", async () => ({ default: createFamily() }));

    await expect(registry.resolveAsync("test:heart")).resolves.toMatchObject({ iconName: "heart" });
  });

  it("invokes a loader once for concurrent loads", async () => {
    let loadCount = 0;
    const registry = new IconRegistry();
    registry.registerLoader("test", async () => {
      loadCount++;
      return createFamily();
    });

    await Promise.all([registry.load("test"), registry.load("test"), registry.resolveAsync("test:x")]);

    expect(loadCount).toBe(1);
  });

  it("retries a loader that rejected", async () => {
    let attempts = 0;
    const registry = new IconRegistry();
    registry.registerLoader("test", async () => {
      attempts++;
      if (attempts === 1) {
        throw new Error("network down");
      }
      return createFamily();
    });

    await expect(registry.load("test")).rejects.toThrow("network down");
    await expect(registry.load("test")).resolves.toMatchObject({ prefix: "test" });
  });

  it("reports an unknown prefix when loading", async () => {
    const registry = new IconRegistry();

    await expect(registry.load("missing")).rejects.toThrow('No icon family or loader registered for prefix "missing"');
  });

  it("resolves asynchronously to undefined when the prefix has no family and no loader", async () => {
    const registry = new IconRegistry();

    await expect(registry.resolveAsync("missing:heart")).resolves.toBeUndefined();
  });

  it("reports membership and lists loaded families", () => {
    const registry = new IconRegistry({ defaultPrefix: "test" });
    registry.registerFamily(createFamily());

    expect(registry.has("test:heart")).toBe(true);
    expect(registry.has("test:absent")).toBe(false);
    expect(registry.list()).toEqual(["heart", "large-mark", "x"]);
    expect(registry.list("absent")).toEqual([]);
    expect(registry.listFamilies()).toEqual(["test"]);
    expect(registry.getFamily("test")?.info.name).toBe("Test Family");
  });
});
