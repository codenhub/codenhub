import { describe, expect, it } from "vitest";

import { generateBaseCss, generateIconCss } from "../src/generator/css-generator.js";
import { svgToDataUri } from "../src/generator/svg-encoder.js";

describe("svgToDataUri", () => {
  it("encodes SVG string into data URI", () => {
    const rawSvg = '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="#ff0000"/></svg>';
    const uri = svgToDataUri(rawSvg);

    expect(uri).toContain("data:image/svg+xml;charset=utf-8,");
    expect(uri).toContain("xmlns='http://www.w3.org/2000/svg'");
    expect(uri).toContain("%23ff0000");
    expect(uri).not.toContain("#");
    expect(uri).not.toContain('"');
  });

  it("handles SVG with existing xmlns attribute and linebreaks", () => {
    const rawSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
        <circle cx="12" cy="12" r="10"/>
      </svg>
    `;
    const uri = svgToDataUri(rawSvg);

    expect(uri).toContain("data:image/svg+xml;charset=utf-8,");
    expect(uri.match(/xmlns/g)?.length).toBe(1);
    expect(uri).not.toContain("\n");
  });
});

describe("css-generator", () => {
  it("generates base CSS with default 'ic' prefix", () => {
    const css = generateBaseCss();
    expect(css).toContain(".ic,");
    expect(css).toContain("background-color: currentColor;");
    expect(css).toContain("mask-repeat: no-repeat;");
    expect(css).toContain("-webkit-mask-repeat: no-repeat;");
  });

  it("generates base CSS with custom prefix", () => {
    const css = generateBaseCss({ prefix: "icon" });
    expect(css).toContain(".icon,");
  });

  it("generates icon CSS rule for a single selector", () => {
    const svg = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>';
    const css = generateIconCss(".ic-circle", svg);

    expect(css).toContain(".ic-circle {");
    expect(css).toContain('mask-image: url("data:image/svg+xml;charset=utf-8,');
    expect(css).toContain('-webkit-mask-image: url("data:image/svg+xml;charset=utf-8,');
  });

  it("generates grouped selector CSS rule for multiple selectors", () => {
    const svg = '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/></svg>';
    const selectors = [".ic-close", ".ic-x", ".ic-cancel"];
    const css = generateIconCss(selectors, svg);

    expect(css).toContain(".ic-close,\n.ic-x,\n.ic-cancel {");
    expect(css).toContain('mask-image: url("data:image/svg+xml');
  });
});
