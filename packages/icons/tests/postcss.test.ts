import { describe, expect, it } from "vitest";

import { postcssIcons } from "../src/postcss.js";
import { IconRegistry } from "../src/registry/registry.js";

describe("postcssIcons", () => {
  it("scans CSS source and appends base and icon mask rules", () => {
    let appendedCss = "";
    const mockRoot = {
      toString: () => ".hero { font-size: 16px; } /* ic-close ic-search */",
      append: (ast: unknown) => {
        appendedCss += String(ast);
      },
    };

    const plugin = postcssIcons();
    expect(plugin.postcssPlugin).toBe("postcss-codenhub-icons");

    const mockParse = (css: string) => css;
    plugin.Once!(mockRoot as never, { parse: mockParse } as never);

    expect(appendedCss).toContain(".ic,");
    expect(appendedCss).toContain(".ic-close {");
    expect(appendedCss).toContain(".ic-search {");
    expect(appendedCss).toContain("mask-image: url(");
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
    plugin.Once!(mockRoot as never, { parse: mockParse } as never);

    expect(appendedCss).toContain(".icon,");
    expect(appendedCss).toContain(".icon-star {");
  });
});
