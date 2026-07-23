import { describe, expect, it } from "vitest";

import { IconRegistry } from "../registry/registry.js";
import { generateBaseCss, generateIconCss, generateIconSetCss } from "./css-generator.js";
import { svgToDataUri } from "./svg-encoder.js";

describe("svgToDataUri", () => {
  it("should convert SVG to UTF-8 data URI", () => {
    const svg = '<svg><path d="M12 2"/></svg>';
    const uri = svgToDataUri(svg);
    expect(uri).toContain("data:image/svg+xml;charset=utf-8,");
    expect(uri).toContain("xmlns='http://www.w3.org/2000/svg'");
    expect(uri).not.toContain('"');
  });

  it("encodes SVG string with hex colors and removes linebreaks", () => {
    const rawSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
        <circle cx="12" cy="12" r="10" fill="#ff0000"/>
      </svg>
    `;
    const uri = svgToDataUri(rawSvg);

    expect(uri).toContain("data:image/svg+xml;charset=utf-8,");
    expect(uri.match(/xmlns/g)?.length).toBe(1);
    expect(uri).toContain("%23ff0000");
    expect(uri).not.toContain("\n");
  });
});

describe("css-generator", () => {
  it("should generate base CSS with default prefix", () => {
    const css = generateBaseCss();
    expect(css).toContain(".ic,");
    expect(css).toContain("background-color: currentColor;");
    expect(css).toContain("-webkit-mask-repeat: no-repeat;");
  });

  it("should generate base CSS with custom prefix", () => {
    const css = generateBaseCss({ prefix: "icon" });
    expect(css).toContain(".icon,");
  });

  it("should generate icon CSS for single selector", () => {
    const css = generateIconCss(".ic-close", "<svg></svg>");
    expect(css).toContain(".ic-close {");
    expect(css).toContain("mask-image: url(");
    expect(css).toContain("-webkit-mask-image: url(");
  });

  it("should generate icon CSS for multiple selectors", () => {
    const css = generateIconCss([".ic-close", ".ic-x"], "<svg></svg>");
    expect(css).toContain(".ic-close,\n.ic-x {");
  });

  it("should generate combined icon set CSS grouping duplicate SVGs", () => {
    const registry = new IconRegistry();
    const svg1 = '<svg><path d="1"/></svg>';
    registry.registerIcon("home", svg1);
    registry.registerIcon("main", svg1);
    registry.registerIcon("user", '<svg><path d="2"/></svg>');

    const css = generateIconSetCss(["ic-home", "ic-main", "ic-user"], registry);
    expect(css).toContain(".ic,");
    expect(css).toContain(".ic-home,\n.ic-main {");
    expect(css).toContain(".ic-user {");
  });
});
