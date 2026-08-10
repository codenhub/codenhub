import { describe, expect, it } from "vitest";

import { findActiveHeadingId, type HeadingPosition } from "./toc-highlight";

const headings: HeadingPosition[] = [
  { id: "install", top: 0 },
  { id: "usage", top: 400 },
  { id: "api", top: 900 },
];

const resolve = (scrollTop: number, overrides: Partial<Parameters<typeof findActiveHeadingId>[0]> = {}) =>
  findActiveHeadingId({
    headings,
    offset: 80,
    scrollHeight: 2000,
    scrollTop,
    viewportHeight: 800,
    ...overrides,
  });

describe("findActiveHeadingId", () => {
  it("returns nothing when the document has no headings", () => {
    expect(resolve(0, { headings: [] })).toBeUndefined();
  });

  it("keeps the first heading active above the first activation line", () => {
    expect(resolve(0)).toBe("install");
  });

  it("activates a heading once it passes the activation line", () => {
    expect(resolve(317)).toBe("install");
    expect(resolve(318)).toBe("usage");
  });

  it("activates the heading a link just scrolled to, despite sub-pixel drift", () => {
    // Following `#usage` parks it on the activation line at `400 - offset`, and
    // a fractional scroll position can leave it a hair short of reaching it.
    expect(resolve(319.4)).toBe("usage");
  });

  it("stays on the last passed heading between sections", () => {
    expect(resolve(500)).toBe("usage");
  });

  it("activates the final heading at the bottom of the scroll range", () => {
    // The last section is short enough that its heading never reaches the
    // activation line, so only the bottom-of-range rule can select it.
    expect(resolve(1200, { headings, scrollHeight: 2000, viewportHeight: 800 })).toBe("api");
  });

  it("treats a document shorter than its viewport as fully scrolled", () => {
    expect(resolve(0, { scrollHeight: 600, viewportHeight: 800 })).toBe("api");
  });
});
