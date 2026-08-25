import { describe, expect, it } from "vitest";

import { normalizeSvg } from "./normalize-svg.ts";

const LUCIDE_ICON = `<!-- @license lucide-static v1.33.0 - ISC -->
<svg
  class="lucide lucide-heart"
  xmlns="http://www.w3.org/2000/svg"
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
>
  <path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676" />
</svg>`;

describe("normalizeSvg", () => {
  it("keeps the artwork and reads geometry from the viewBox", () => {
    const icon = normalizeSvg(LUCIDE_ICON, "heart.svg");

    expect(icon.width).toBe(24);
    expect(icon.height).toBe(24);
    expect(icon.body).toContain('<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676" />');
  });

  it("moves presentation attributes onto a wrapping group", () => {
    const icon = normalizeSvg(LUCIDE_ICON, "heart.svg");

    expect(icon.body.startsWith('<g fill="none" stroke="currentColor" stroke-width="2">')).toBe(true);
    expect(icon.body.endsWith("</g>")).toBe(true);
  });

  it("drops the attributes that describe the document rather than the artwork", () => {
    const icon = normalizeSvg(LUCIDE_ICON, "heart.svg");

    expect(icon.body).not.toContain("xmlns");
    expect(icon.body).not.toContain("class=");
    expect(icon.body).not.toContain('width="24"');
  });

  it("leaves markup ungrouped when the wrapper carried no presentation", () => {
    const icon = normalizeSvg('<svg viewBox="0 0 20 20"><path d="M0 0" /></svg>', "plain.svg");

    expect(icon.body).toBe('<path d="M0 0" />');
  });

  it("collapses the whitespace an authored file carries", () => {
    const icon = normalizeSvg('<svg viewBox="0 0 24 24">\n  <path d="a" />\n  <path d="b" />\n</svg>', "two.svg");

    expect(icon.body).toBe('<path d="a" /><path d="b" />');
  });

  it("falls back to width and height when no viewBox is declared", () => {
    const icon = normalizeSvg('<svg width="48" height="32"><path d="M0 0" /></svg>', "sized.svg");

    expect(icon).toMatchObject({ height: 32, width: 48 });
  });

  it("names the file it could not read", () => {
    expect(() => normalizeSvg("not markup", "broken.svg")).toThrow("No <svg> element in broken.svg.");
    expect(() => normalizeSvg("<svg><path /></svg>", "sizeless.svg")).toThrow("No usable viewBox in sizeless.svg.");
    expect(() => normalizeSvg('<svg viewBox="0 0 24 24">  </svg>', "empty.svg")).toThrow(
      "Empty icon body in empty.svg.",
    );
  });
});
