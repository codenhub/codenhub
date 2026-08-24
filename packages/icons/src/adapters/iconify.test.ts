import { describe, expect, it } from "vitest";

import { IconRegistry } from "../core/registry.js";
import { adoptIconifySet, type IconifyJson } from "./iconify.js";

const source: IconifyJson = {
  aliases: { cancel: { parent: "close" } },
  height: 16,
  icons: { close: { body: '<path d="M0 0" />' }, tall: { body: "<path />", height: 32 } },
  info: {
    author: { name: "Set Authors", url: "https://set.test" },
    license: { spdx: "MIT", title: "MIT License", url: "https://set.test/license" },
    name: "Some Set",
    total: 2,
  },
  prefix: "some-set",
  width: 16,
};

describe("adoptIconifySet", () => {
  it("keeps icon bodies, geometry, and aliases as authored", () => {
    const family = adoptIconifySet(source);

    expect(family.prefix).toBe("some-set");
    expect(family.icons.close?.body).toBe('<path d="M0 0" />');
    expect(family.icons.tall?.height).toBe(32);
    expect(family.aliases?.cancel).toEqual({ parent: "close" });
    expect(family.width).toBe(16);
  });

  it("resolves through a registry once adopted", () => {
    const registry = new IconRegistry();
    registry.registerFamily(adoptIconifySet(source));

    expect(registry.resolve("some-set:cancel")).toMatchObject({ height: 16, iconName: "close", width: 16 });
  });

  it("treats an adopted set as extended tier owing a notice", () => {
    const family = adoptIconifySet(source);

    expect(family.info.tier).toBe("extended");
    expect(family.info.attribution).toBe("notice");
  });

  it("accepts a stated obligation and stroke width the document cannot carry", () => {
    const family = adoptIconifySet(source, { attribution: "credit", strokeWidth: 1.5 });

    expect(family.info.attribution).toBe("credit");
    expect(family.info.strokeWidth).toBe(1.5);
  });

  it("falls back to the prefix and a counted total when metadata is absent", () => {
    const family = adoptIconifySet({ icons: { a: { body: "<path />" } }, prefix: "bare" });

    expect(family.info.name).toBe("bare");
    expect(family.info.total).toBe(1);
    expect(family.info.license.spdx).toBe("Unknown");
  });
});
