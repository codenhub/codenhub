import { describe, expect, it } from "vitest";

import { IconRegistry } from "../core/registry.js";
import type { IconFamilyData } from "../core/types.js";
import {
  escapeSelectorClass,
  generateBaseCss,
  generateFamilyCss,
  generateIconCss,
  generateIconSetCss,
  getIconCssProps,
  getIconMaskUrl,
} from "./css-generator.js";

function createQuillFamily(): IconFamilyData {
  return {
    aliases: { cancel: { parent: "x" } },
    icons: {
      heart: { body: '<g stroke-width="2"><path d="heart" /></g>' },
      x: { body: '<g stroke-width="2"><path d="x" /></g>' },
    },
    info: {
      attribution: "notice",
      author: { name: "Quill Authors", url: "https://quill.test" },
      license: { spdx: "ISC", title: "ISC License", url: "https://quill.test/license" },
      name: "Quill Family",
      strokeWidth: 2,
      tier: "core",
      total: 2,
      upstream: { package: "quill-icons", version: "1.0.0" },
    },
    prefix: "quill",
  };
}

function createFilledFamily(): IconFamilyData {
  return {
    icons: { star: { body: '<path fill="currentColor" d="star" />' } },
    info: {
      attribution: "none",
      author: { name: "Filled Authors", url: "https://filled.test" },
      license: { spdx: "CC0-1.0", title: "CC0 1.0", url: "https://filled.test/license" },
      name: "Filled Family",
      tier: "core",
      total: 1,
      upstream: { package: "filled-icons", version: "1.0.0" },
    },
    prefix: "filled",
  };
}

function createRegistry(): IconRegistry {
  const registry = new IconRegistry({ defaultPrefix: "quill" });
  registry.registerFamily(createQuillFamily());
  registry.registerFamily(createFilledFamily());
  return registry;
}

describe("generateBaseCss", () => {
  it("covers standalone elements, pseudo-elements, and form controls", () => {
    const css = generateBaseCss();

    expect(css).toContain('i[class^="ic-"]');
    expect(css).toContain(".ic-after::after");
    expect(css).toContain('input[class^="ic-"]');
  });

  it("honors a custom class prefix", () => {
    expect(generateBaseCss({ prefix: "ux" })).toContain('i[class^="ux-"]');
  });
});

describe("generateIconCss", () => {
  it("emits the mask custom properties for one selector", () => {
    const css = generateIconCss(".ic-x", "<svg></svg>");

    expect(css).toContain(".ic-x {");
    expect(css).toContain('--ic-uri: url("data:image/svg+xml;charset=utf-8,');
    expect(css).toContain("--ic-mask: var(--ic-uri);");
  });

  it("groups several selectors on one rule", () => {
    expect(generateIconCss([".ic-x", ".ic-cancel"], "<svg></svg>")).toContain(".ic-x,\n.ic-cancel {");
  });
});

describe("escapeSelectorClass", () => {
  it("escapes the slash and the dot of a stroke modifier", () => {
    expect(escapeSelectorClass("ic-heart/1.5")).toBe("ic-heart\\/1\\.5");
  });
});

describe("generateIconSetCss", () => {
  it("generates a rule for each resolved class and reports the families used", () => {
    const { css, families } = generateIconSetCss(["ic-heart", "ic-filled-star"], createRegistry());

    expect(css).toContain(".ic-heart {");
    expect(css).toContain(".ic-filled-star {");
    expect(families.map(({ prefix }) => prefix)).toEqual(["filled", "quill"]);
  });

  it("skips classes that resolve to no icon", () => {
    const { css, families } = generateIconSetCss(["ic-absent"], createRegistry());

    expect(css).not.toContain(".ic-absent");
    expect(families).toEqual([]);
  });

  it("ignores classes that do not carry the icon prefix", () => {
    const { css } = generateIconSetCss(["btn-primary"], createRegistry());

    expect(css).toBe(generateBaseCss());
  });

  it("groups an alias and its parent into one rule", () => {
    const { css } = generateIconSetCss(["ic-quill-x", "ic-quill-cancel"], createRegistry());

    expect(css).toContain(".ic-quill-x,\n.ic-quill-cancel {");
  });

  it("emits one rule for a class carrying a stroke modifier", () => {
    const { css } = generateIconSetCss(["ic-heart/1.5"], createRegistry());

    expect(css).toContain(".ic-heart\\/1\\.5 {");
    expect(css).toContain("stroke-width=%221.5%22");
  });

  it("keeps a modified class separate from the same icon unmodified", () => {
    const { css } = generateIconSetCss(["ic-heart", "ic-heart/1.5"], createRegistry());

    expect(css).toContain(".ic-heart {");
    expect(css).toContain(".ic-heart\\/1\\.5 {");
  });

  it("ignores a stroke modifier on a family drawn as filled paths", () => {
    const { css } = generateIconSetCss(["ic-filled-star", "ic-filled-star/1.5"], createRegistry());

    // Both classes resolve and render the same artwork, so they share one rule:
    // stroke width is meaningless for a family drawn as filled paths.
    expect(css).toContain(".ic-filled-star,\n.ic-filled-star\\/1\\.5 {");
  });

  it("omits the base rules when they are not wanted", () => {
    const { css } = generateIconSetCss(["ic-heart"], createRegistry(), { injectBase: false });

    expect(css).not.toContain('i[class^="ic-"]');
    expect(css).toContain(".ic-heart {");
  });

  it("applies the requested strokeWidth to the base icon rule", () => {
    const registry = createRegistry();
    const atOne = generateIconSetCss(["ic-heart"], registry, { strokeWidth: 1 });
    const atThree = generateIconSetCss(["ic-heart"], registry, { strokeWidth: 3 });

    expect(atOne.css).not.toBe(atThree.css);
  });
});

describe("getIconMaskUrl", () => {
  it("resolves a registered icon into a data URI", () => {
    expect(getIconMaskUrl("heart", createRegistry())?.startsWith('url("data:image/svg+xml')).toBe(true);
  });

  it("encodes raw SVG markup without a registry", () => {
    expect(getIconMaskUrl("<svg></svg>")).toBe(
      'url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22%3E%3C/svg%3E")',
    );
  });

  it("returns nothing for a name that resolves to no icon", () => {
    expect(getIconMaskUrl("absent", createRegistry())).toBeUndefined();
    expect(getIconMaskUrl("heart")).toBeUndefined();
  });

  it("differs when a different strokeWidth is requested", () => {
    const registry = createRegistry();

    expect(getIconMaskUrl("heart", registry, { strokeWidth: 1 })).not.toBe(
      getIconMaskUrl("heart", registry, { strokeWidth: 3 }),
    );
  });
});

describe("getIconCssProps", () => {
  it("returns the custom properties an inline style needs", () => {
    const props = getIconCssProps("heart", createRegistry());

    expect(Object.keys(props ?? {}).toSorted()).toEqual(["--ic-mask", "--ic-uri"]);
  });

  it("returns nothing for a name that resolves to no icon", () => {
    expect(getIconCssProps("absent", createRegistry())).toBeUndefined();
  });
});

describe("generateFamilyCss", () => {
  const family = createQuillFamily();

  it("writes every icon of the family", () => {
    const css = generateFamilyCss(family);

    expect(css).toContain(".ic-quill-heart");
    expect(css).toContain(".ic-quill-x");
  });

  it("gives each rule a bare selector beside the qualified one", () => {
    // One rule, two selectors: the bare name costs a selector rather than a
    // second copy of the artwork, and import order decides which family wins it.
    expect(generateFamilyCss(family)).toContain(".ic-quill-heart,\n.ic-heart {");
  });

  it("omits the bare selectors when they are not wanted", () => {
    const css = generateFamilyCss(family, { bareNames: false });

    expect(css).toContain(".ic-quill-heart {");
  });

  it("writes an alias as its own selector", () => {
    expect(generateFamilyCss(family)).toContain(".ic-quill-cancel");
  });

  it("opens with the family license notice as a preserved comment", () => {
    const css = generateFamilyCss(family);

    expect(css.startsWith("/*!")).toBe(true);
    expect(css).toContain("ISC License");
  });

  it("omits the notice when it is not wanted", () => {
    const css = generateFamilyCss(family, { attribution: false });

    expect(css.startsWith(".ic-quill")).toBe(true);
  });

  it("honours a custom class prefix", () => {
    expect(generateFamilyCss(family, { prefix: "icon" })).toContain(".icon-quill-heart,\n.icon-heart {");
  });
});
