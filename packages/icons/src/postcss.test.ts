import { describe, expect, it } from "vitest";

import { postcssIcons, postcssIconsPlugin } from "./postcss.js";
import { IconRegistry } from "./registry/registry.js";

describe("postcssIcons plugin", () => {
  it("should create postcssIconsPlugin and append base and icon mask rules", () => {
    const plugin = postcssIconsPlugin({ injectBase: true });

    let appended = "";
    const mockRoot = {
      toString: () => ".button { color: red; } /* ic-close ic-search */",
      append: (css: unknown) => {
        appended += String(css);
      },
    };

    const mockParse = (css: string) => css;
    plugin.Once(mockRoot, { parse: mockParse } as never);

    expect(plugin.postcssPlugin).toBe("postcss-codenhub-icons");
    expect(appended).toContain(".ic,");
    expect(appended).toContain(".ic-close {");
    expect(appended).toContain(".ic-search {");
    expect(appended).toContain("mask-image: url(");
  });

  it("respects custom registry and prefix", () => {
    let appendedCss = "";
    const mockRoot = {
      toString: () => "<div class='icon-star'></div>",
      append: (ast: unknown) => {
        appendedCss += String(ast);
      },
    };

    const customRegistry = new IconRegistry({ defaultPrefix: "custom" });
    customRegistry.registerIcon("star", "<svg><circle r='5'/></svg>");

    const plugin = postcssIcons({
      prefix: "icon",
      registry: customRegistry,
    });

    const mockParse = (css: string) => css;
    plugin.Once(mockRoot, { parse: mockParse } as never);

    expect(appendedCss).toContain(".icon,");
    expect(appendedCss).toContain(".icon-star {");
  });
});
