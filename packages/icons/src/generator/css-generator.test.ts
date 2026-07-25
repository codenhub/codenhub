import { describe, expect, it } from "vitest";

import { IconRegistry } from "../registry/registry.js";
import { generateBaseCss, generateIconCss, generateIconSetCss } from "./css-generator.js";
import { svgToDataUri } from "./svg-encoder.js";

describe("svgToDataUri", () => {
  it("should convert SVG to UTF-8 data URI", () => {
    const svg = '<svg><path d="M12 2"/></svg>';
    const uri = svgToDataUri(svg);
    expect(uri).toContain("data:image/svg+xml;charset=utf-8,");
    expect(uri).toContain("xmlns=%22http://www.w3.org/2000/svg%22");
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

  it("should generate custom global stroke width CSS", () => {
    const registry = new IconRegistry();
    registry.registerIcon("home", '<svg stroke-width="2"><path d="1"/></svg>');
    const css = generateIconSetCss(["ic-home"], registry, { strokeWidth: 1.5 });
    // Verify that the stroke-width got changed to 1.5
    expect(css).toContain("stroke-width=%221.5%22");
    expect(css).not.toContain("stroke-width=%222%22");
  });

  it("should generate combined rules for per-icon stroke override classes", () => {
    const registry = new IconRegistry();
    registry.registerIcon("home", '<svg stroke-width="2"><path d="1"/></svg>');
    registry.registerIcon("static", {
      svg: '<svg stroke-width="2"><path d="2"/></svg>',
      strokeConfigurable: false,
    });

    const css = generateIconSetCss(["ic-home", "ic-static", "ic-stroke-1.5", "ic-stroke-3"], registry);

    // Check that we get .ic-home.ic-stroke-1\.5 rule
    expect(css).toContain(".ic-home.ic-stroke-1\\.5 {");
    expect(css).toContain(".ic-home.ic-stroke-3 {");
    expect(css).toContain("stroke-width=%221.5%22");
    expect(css).toContain("stroke-width=%223%22");

    // Check that we DO NOT get any stroke-width override rules for "static" icon
    expect(css).not.toContain(".ic-static.ic-stroke-1\\.5 {");
    expect(css).not.toContain(".ic-static.ic-stroke-3 {");
  });
});
