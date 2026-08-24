import { describe, expect, it } from "vitest";

import { IconRegistry } from "../core/registry.js";
import type { IconFamilyData } from "../core/types.js";
import {
  escapeSelectorClass,
  generateBaseCss,
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
  it("escapes the dot in a fractional stroke class", () => {
    expect(escapeSelectorClass("ic-stroke-1.5")).toBe("ic-stroke-1\\.5");
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

  it("emits a combined rule for each scanned stroke width", () => {
    const { css } = generateIconSetCss(["ic-heart", "ic-stroke-1.5"], createRegistry());

    expect(css).toContain(".ic-heart.ic-stroke-1\\.5 {");
  });

  it("does not emit stroke rules for a family drawn as filled paths", () => {
    const { css } = generateIconSetCss(["ic-filled-star", "ic-stroke-1.5"], createRegistry());

    expect(css).not.toContain(".ic-filled-star.ic-stroke-1\\.5");
  });

  it("omits the base rules when they are not wanted", () => {
    const { css } = generateIconSetCss(["ic-heart"], createRegistry(), { injectBase: false });

    expect(css).not.toContain('i[class^="ic-"]');
    expect(css).toContain(".ic-heart {");
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
