import { describe, expect, it } from "vitest";

import { IconRegistry } from "../registry/registry.js";
import {
  generateBaseCss,
  generateIconCss,
  generateIconSetCss,
  getIconCssProps,
  getIconMaskUrl,
} from "./css-generator.js";
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
    expect(css).toContain('i[class^="ic-"],');
    expect(css).toContain(".ic {");
    expect(css).toContain("mask-image: var(--ic-mask);");
    expect(css).toContain("background-color: var(--ic-color, currentColor);");
    expect(css).toContain("::before {");
    expect(css).toContain(".ic-after::after");
    expect(css).toContain('input[class^="ic-"],');
    expect(css).toContain("background-image: var(--ic-uri);");
  });

  it("should generate base CSS with custom prefix", () => {
    const css = generateBaseCss({ prefix: "icon" });
    expect(css).toContain('i[class^="icon-"],');
    expect(css).toContain(".icon {");
    expect(css).toContain("mask-image: var(--icon-mask);");
    expect(css).toContain("background-image: var(--icon-uri);");
  });

  it("should generate icon CSS with custom properties for single selector", () => {
    const css = generateIconCss(".ic-close", "<svg></svg>");
    expect(css).toContain(".ic-close {");
    expect(css).toContain("--ic-uri: url(");
    expect(css).toContain("--ic-mask: var(--ic-uri);");
  });

  it("should generate icon CSS for multiple selectors", () => {
    const css = generateIconCss([".ic-close", ".ic-x"], "<svg></svg>");
    expect(css).toContain(".ic-close,\n.ic-x {");
    expect(css).toContain("--ic-uri: url(");
  });

  it("should generate combined icon set CSS grouping duplicate SVGs", () => {
    const registry = new IconRegistry();
    const svg1 = '<svg><path d="1"/></svg>';
    registry.registerIcon("home", svg1);
    registry.registerIcon("main", svg1);
    registry.registerIcon("user", '<svg><path d="2"/></svg>');

    const css = generateIconSetCss(["ic-home", "ic-main", "ic-user"], registry);
    expect(css).toContain(".ic {");
    expect(css).toContain(".ic-home,\n.ic-main {");
    expect(css).toContain(".ic-user {");
    expect(css).toContain("--ic-uri: url(");
  });

  it("should generate custom global stroke width CSS", () => {
    const registry = new IconRegistry();
    registry.registerIcon("home", '<svg stroke-width="2"><path d="1"/></svg>');
    const css = generateIconSetCss(["ic-home"], registry, { strokeWidth: 1.5 });
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

    expect(css).toContain(".ic-home.ic-stroke-1\\.5 {");
    expect(css).toContain(".ic-home.ic-stroke-3 {");
    expect(css).toContain("stroke-width=%221.5%22");
    expect(css).toContain("stroke-width=%223%22");

    expect(css).not.toContain(".ic-static.ic-stroke-1\\.5 {");
    expect(css).not.toContain(".ic-static.ic-stroke-3 {");
  });

  it("should provide getIconMaskUrl and getIconCssProps helpers", () => {
    const registry = new IconRegistry();
    const svg = '<svg stroke-width="2"><path d="1"/></svg>';
    registry.registerIcon("check", svg);

    const maskUrlFromSvg = getIconMaskUrl(svg);
    expect(maskUrlFromSvg).toContain('url("data:image/svg+xml');

    const maskUrlFromName = getIconMaskUrl("check", registry, { strokeWidth: 3 });
    expect(maskUrlFromName).toContain("stroke-width=%223%22");

    const cssProps = getIconCssProps("check", registry);
    expect(cssProps).toBeDefined();
    expect(cssProps?.["--ic-uri"]).toContain('url("data:image/svg+xml');
    expect(cssProps?.["--ic-mask"]).toBe("var(--ic-uri)");
  });
});
