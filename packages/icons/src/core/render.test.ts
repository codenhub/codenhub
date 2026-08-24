import { describe, expect, it } from "vitest";

import { renderSvg, setStrokeWidth } from "./render.js";
import type { ResolvedIcon } from "./types.js";

const strokeIcon: ResolvedIcon = {
  body: '<g stroke-width="2"><path d="M0 0" /></g>',
  height: 24,
  iconName: "heart",
  name: "test:heart",
  prefix: "test",
  strokeWidth: 2,
  width: 24,
};

const filledIcon: ResolvedIcon = {
  body: '<path fill="currentColor" d="M0 0" />',
  height: 20,
  iconName: "star",
  name: "filled:star",
  prefix: "filled",
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
});

describe("renderSvg", () => {
  it("wraps the body in an element carrying only namespace and viewBox", () => {
    expect(renderSvg(strokeIcon)).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g stroke-width="2"><path d="M0 0" /></g></svg>',
    );
  });

  it("uses the icon's own geometry for the viewBox", () => {
    expect(renderSvg(filledIcon)).toContain('viewBox="0 0 20 20"');
  });

  it("applies a requested stroke width to a stroke-based icon", () => {
    expect(renderSvg(strokeIcon, { strokeWidth: 1 })).toContain('stroke-width="1"');
  });

  it("ignores a requested stroke width for an icon that is not stroke-based", () => {
    expect(renderSvg(filledIcon, { strokeWidth: 1 })).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path fill="currentColor" d="M0 0" /></svg>',
    );
  });

  it("places extra attributes on the element", () => {
    expect(renderSvg(strokeIcon, { attributes: { "aria-hidden": "true", class: "icon" } })).toContain(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" class="icon">',
    );
  });
});
