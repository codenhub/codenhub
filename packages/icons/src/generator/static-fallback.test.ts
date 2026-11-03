import { describe, expect, it } from "vitest";

import { IconRegistry } from "../core/registry.js";
import type { IconFamilyData } from "../core/types.js";
import { generateBaseCss, generateFamilyCss, generateIconSetCss, getIconCssProps } from "./css-generator.js";

const animatedBody =
  '<path stroke-width="2" d="animated"><animate attributeName="opacity" values="0;1" dur="1s" /></path>';
const staticBody = '<path stroke-width="2" d="static" />';

function createAnimatedFamily(): IconFamilyData {
  return {
    aliases: { alias: { parent: "draw" } },
    icons: {
      draw: { body: animatedBody, staticBody },
      loop: { body: animatedBody },
    },
    info: {
      attribution: "notice",
      author: { name: "Test", url: "https://example.test" },
      license: { spdx: "MIT", title: "MIT", url: "https://example.test/license" },
      name: "Animated",
      strokeWidth: 2,
      tier: "core",
      total: 2,
      upstream: { package: "animated", version: "1" },
    },
    prefix: "animated",
  };
}

describe("static artwork for reduced motion", () => {
  it.each(["ic", "ux"])("paints static artwork at rest and under reduced motion with prefix %s", (prefix) => {
    const css = generateBaseCss({ prefix });
    expect(css).toContain(`.${prefix}.${prefix}-on-hover:not(:hover):not(:hover > *):not(:focus-visible > *)`);
    expect(css).toContain(`mask-image: var(--${prefix}-static-mask, var(--${prefix}-mask));`);
    expect(css).toContain(`mask-image: var(--${prefix}-static-mask, var(--${prefix}-mask)) !important;`);
  });

  it("includes static artwork in CSS properties with the requested prefix and stroke width", () => {
    const registry = new IconRegistry();
    registry.registerFamily(createAnimatedFamily());
    const props = getIconCssProps("animated:draw", registry, { prefix: "ux", strokeWidth: 1.5 });
    expect(props?.["--ux-static-mask"]).toContain("d=%22static%22");
    expect(props?.["--ux-static-mask"]).toContain("stroke-width=%221.5%22");
  });

  it("resolves static artwork through aliases", () => {
    const registry = new IconRegistry();
    registry.registerFamily(createAnimatedFamily());

    expect(registry.resolve("animated:alias")?.staticBody).toBe(staticBody);
  });

  it("carries static masks beside animated masks for qualified and bare selectors", () => {
    const css = generateFamilyCss(createAnimatedFamily());

    expect(css).toContain("--ic-static-mask: url(");
    expect(css).toContain("d=%22static%22");
    expect(css).toContain(".ic-animated-alias,\n.ic-alias {");
    expect(css.match(/--ic-static-mask:/g)).toHaveLength(2);
    expect(css).not.toContain("@media");
  });

  it("keeps distinct fallbacks when animated artwork is shared and applies stroke modifiers", () => {
    const registry = new IconRegistry({ defaultPrefix: "animated" });
    registry.registerFamily(createAnimatedFamily());
    const { css } = generateIconSetCss(["ux-draw/1.5", "ux-alias/1.5", "ux-loop/1.5"], registry, {
      injectBase: false,
      prefix: "ux",
    });

    expect(css).toContain(".ux-draw\\/1\\.5,\n.ux-alias\\/1\\.5 {");
    const fallback = css.match(/--ux-static-mask: ([^\n]+)/)?.[1] ?? "";
    expect(fallback).toContain("stroke-width=%221.5%22");
    expect(fallback).toContain("d=%22static%22");
    expect(fallback).not.toContain("animate");
    expect(fallback).not.toContain("ux-loop");
  });
});
