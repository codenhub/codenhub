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

const logo: ResolvedIcon = {
  body: '<path fill="#ea4335" d="M0 0" /><path fill="none" stroke="#34a853" style="stroke-width: 2" d="M1 1" />',
  height: 24,
  iconName: "google",
  left: 0,
  multicolor: true,
  name: "logos:google",
  prefix: "logos",
  top: 0,
  width: 24,
};

describe("renderSvg for a multicolor icon", () => {
  it("lets --ic-color override each fill, falling back to the artwork's own", () => {
    expect(renderSvg(logo)).toContain('<path fill="#ea4335" d="M0 0" style="fill: var(--ic-color, #ea4335)" />');
  });

  it("merges the override into a style the element already has, and leaves fill none alone", () => {
    expect(renderSvg(logo)).toContain(
      '<path fill="none" stroke="#34a853" style="stroke-width: 2; stroke: var(--ic-color, #34a853)" d="M1 1" />',
    );
  });

  it("keeps SVG's default black fill instead of the text color for unpainted shapes", () => {
    expect(renderSvg(logo)).toContain('<g fill="#000" style="fill: var(--ic-color, #000)">');
  });

  it("leaves mask, clip, and filter content unpainted, since recoloring it changes the shape", () => {
    const masked = {
      ...logo,
      body: '<mask id="m"><rect fill="#fff" /></mask><clipPath id="c"><rect fill="#fff" /></clipPath><filter id="f"><feFlood flood-color="#000" /></filter><path fill="#f00" mask="url(#m)" />',
    };
    const svg = renderSvg(masked);

    expect(svg).toContain('<mask id="m"><rect fill="#fff" /></mask>');
    expect(svg).toContain('<clipPath id="c"><rect fill="#fff" /></clipPath>');
    expect(svg).toContain('<filter id="f"><feFlood flood-color="#000" /></filter>');
    expect(svg).toContain('style="fill: var(--ic-color, #f00)"');
  });

  it("reads the override from the configured class prefix", () => {
    expect(renderSvg(logo, { prefix: "icon" })).toContain("var(--icon-color, #ea4335)");
  });

  it("leaves a one-color icon's paint as written", () => {
    expect(renderSvg({ ...logo, multicolor: undefined })).not.toContain("var(--ic-color");
  });
});

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
