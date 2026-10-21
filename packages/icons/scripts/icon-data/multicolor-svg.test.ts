import { describe, expect, it } from "vitest";

import { findUnsupportedMarkup, namespaceIds, optimizeArtwork } from "./multicolor-svg.ts";

describe("namespaceIds", () => {
  it("prefixes an id and every url() reference to it", () => {
    const body = '<linearGradient id="a"></linearGradient><path fill="url(#a)" style="stroke: url(\'#a\')" />';

    expect(namespaceIds(body, "logos-google")).toBe(
      '<linearGradient id="logos-google-a"></linearGradient><path fill="url(#logos-google-a)" style="stroke: url(\'#logos-google-a\')" />',
    );
  });

  it("prefixes href references and writes xlink:href as href", () => {
    const body = '<path id="p" /><use xlink:href="#p" /><use href="#p" />';

    expect(namespaceIds(body, "ns")).toBe('<path id="ns-p" /><use href="#ns-p" /><use href="#ns-p" />');
  });

  it("leaves a reference to an id the body does not define as written", () => {
    expect(namespaceIds('<path fill="url(#elsewhere)" />', "ns")).toBe('<path fill="url(#elsewhere)" />');
  });

  it("does not read the end of another attribute as an id", () => {
    expect(namespaceIds('<path data-id="x" />', "ns")).toBe('<path data-id="x" />');
  });
});

describe("findUnsupportedMarkup", () => {
  it("accepts gradients, masks, clips, and filters", () => {
    expect(
      findUnsupportedMarkup(
        '<svg><defs><linearGradient id="a" /><mask id="m" /><clipPath id="c" /><filter id="f" /></defs><use href="#a" /></svg>',
      ),
    ).toBeUndefined();
  });

  it("names a stylesheet, which would restyle the page once inlined", () => {
    expect(findUnsupportedMarkup("<svg><style>.a{fill:red}</style></svg>")).toBe("a <style> element");
  });

  it("names an embedded image", () => {
    expect(findUnsupportedMarkup('<svg><image href="data:image/png;base64,AA" /></svg>')).toBe("an <image> element");
  });

  it("names an external reference", () => {
    expect(findUnsupportedMarkup('<svg><use href="other.svg#a" /></svg>')).toBe("an external reference");
  });
});

describe("optimizeArtwork", () => {
  const SOURCE =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><linearGradient id="g"><stop stop-color="#FFFFFF" /></linearGradient></defs><path fill="url(#g)" d="M10.1234567,10.1234567 L200.9876543,10.1234567 L200.9876543,200.9876543 Z"/></svg>';

  it("rounds coordinates to two decimals", () => {
    const output = optimizeArtwork(SOURCE, "test.svg");

    expect(output).toContain("10.12");
    expect(output).not.toContain("10.1234567");
  });

  it("keeps ids for namespacing and colors as written", () => {
    const output = optimizeArtwork(SOURCE, "test.svg");

    expect(output).toContain('id="g"');
    expect(output).toContain('fill="url(#g)"');
    expect(output).toContain('stop-color="#FFFFFF"');
  });

  it("names the file it cannot parse", () => {
    expect(() => optimizeArtwork("<svg><path", "broken.svg")).toThrow("broken.svg");
  });
});
