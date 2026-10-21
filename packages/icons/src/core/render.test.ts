import { describe, expect, it } from "vitest";

import { renderSvg, setStrokeWidth } from "./render.js";
import type { ResolvedIcon } from "./types.js";

const strokeIcon: ResolvedIcon = {
  body: '<g stroke-width="2"><path d="M0 0" /></g>',
  height: 24,
  iconName: "heart",
  left: 0,
  name: "test:heart",
  prefix: "test",
  strokeWidth: 2,
  top: 0,
  width: 24,
};

const filledIcon: ResolvedIcon = {
  body: '<path fill="currentColor" d="M0 0" />',
  height: 20,
  iconName: "star",
  left: 0,
  name: "filled:star",
  prefix: "filled",
  top: 0,
  width: 20,
};

describe("setStrokeWidth", () => {
  it("replaces every stroke width in the markup", () => {
    expect(setStrokeWidth('<g stroke-width="2"><path stroke-width="2" /></g>', 1.5)).toBe(
      '<g stroke-width="1.5"><path stroke-width="1.5" /></g>',
    );
  });

  it("leaves markup without a stroke width unchanged", () => {
    expect(setStrokeWidth('<path fill="currentColor" />', 3)).toBe('<path fill="currentColor" />');
  });

  it("escapes a quote in the stroke width so it cannot break out of the attribute", () => {
    expect(setStrokeWidth('<path stroke-width="2" />', '2" onclick="x')).toBe(
      '<path stroke-width="2&quot; onclick=&quot;x" />',
    );
  });
});

const offsetIcon: ResolvedIcon = {
  body: '<path d="M0 0" />',
  height: 960,
  iconName: "home",
  left: 0,
  name: "offset:home",
  prefix: "offset",
  top: -960,
  width: 960,
};

describe("renderSvg", () => {
  it("wraps the body in an element carrying a namespace, a viewBox, and a 1em box", () => {
    expect(renderSvg(strokeIcon)).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor"><g stroke-width="2"><path d="M0 0" /></g></svg>',
    );
  });

  it("uses the icon's own geometry for the viewBox", () => {
    expect(renderSvg(filledIcon)).toContain('viewBox="0 0 20 20"');
  });

  it("lets a caller replace the default 1em size", () => {
    const svg = renderSvg(filledIcon, { attributes: { width: "24", height: "24" } });

    expect(svg).toContain('width="24" height="24"');
    expect(svg).not.toContain('width="1em"');
  });

  it("applies a requested stroke width to a stroke-based icon", () => {
    expect(renderSvg(strokeIcon, { strokeWidth: 1 })).toContain('stroke-width="1"');
  });

  it("ignores a requested stroke width for an icon that is not stroke-based", () => {
    expect(renderSvg(filledIcon, { strokeWidth: 1 })).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="1em" height="1em" fill="currentColor"><path fill="currentColor" d="M0 0" /></svg>',
    );
  });

  it("paints a body that sets no fill of its own in currentColor", () => {
    // Material Symbols and Simple Icons bodies are bare paths, which SVG fills
    // black by default: inlined, they ignored `color` and `--ic-color`.
    expect(renderSvg(offsetIcon)).toContain(' fill="currentColor">');
  });

  it("paints a colored icon in its own color unless --ic-color says otherwise", () => {
    expect(renderSvg({ ...offsetIcon, color: "#181717" })).toContain(
      '<g color="#181717" style="color: var(--ic-color, #181717)"><path d="M0 0" /></g></svg>',
    );
  });

  it("names the color property after a custom class prefix", () => {
    expect(renderSvg({ ...offsetIcon, color: "#181717" }, { prefix: "ux" })).toContain("var(--ux-color, #181717)");
  });

  it("keeps a viewBox that does not start at the origin", () => {
    expect(renderSvg(offsetIcon)).toContain('viewBox="0 -960 960 960"');
  });

  it("places extra attributes on the element", () => {
    expect(renderSvg(strokeIcon, { attributes: { "aria-hidden": "true", class: "icon" } })).toContain(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true" class="icon">',
    );
  });

  it("escapes a quote in an extra attribute value so it cannot break out of the attribute", () => {
    expect(renderSvg(filledIcon, { attributes: { "aria-label": '" onclick="x' } })).toContain(
      'aria-label="&quot; onclick=&quot;x"',
    );
  });

  it("drops an extra attribute whose name is not a valid SVG attribute name", () => {
    expect(renderSvg(filledIcon, { attributes: { '"><script>alert(1)</script': "x" } })).not.toContain("<script>");
  });

  it("drops an event-handler attribute regardless of casing", () => {
    const svg = renderSvg(filledIcon, { attributes: { onLoad: "alert(1)", onerror: "alert(1)" } });

    expect(svg).not.toContain("onLoad");
    expect(svg).not.toContain("onerror");
  });
});
