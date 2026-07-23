import { describe, expect, it } from "vitest";

import { generateBaseCss, generateIconCss } from "./css-generator.js";
import { svgToDataUri } from "./svg-encoder.js";

describe("css-generator", () => {
  it("should convert SVG to UTF-8 data URI", () => {
    const svg = '<svg><path d="M12 2"/></svg>';
    const uri = svgToDataUri(svg);
    expect(uri).toContain("data:image/svg+xml;charset=utf-8,");
    expect(uri).toContain("xmlns='http://www.w3.org/2000/svg'");
    expect(uri).not.toContain('"');
  });

  it("should generate base CSS with default prefix", () => {
    const css = generateBaseCss();
    expect(css).toContain(".ic,");
    expect(css).toContain("background-color: currentColor;");
  });

  it("should generate base CSS with custom prefix", () => {
    const css = generateBaseCss({ prefix: "icon" });
    expect(css).toContain(".icon,");
  });

  it("should generate icon CSS for single selector", () => {
    const css = generateIconCss(".ic-close", "<svg></svg>");
    expect(css).toContain(".ic-close {");
    expect(css).toContain("mask-image: url(");
  });

  it("should generate icon CSS for multiple selectors", () => {
    const css = generateIconCss([".ic-close", ".ic-x"], "<svg></svg>");
    expect(css).toContain(".ic-close,\n.ic-x {");
  });
});
