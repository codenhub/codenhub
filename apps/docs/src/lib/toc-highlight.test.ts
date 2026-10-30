import { describe, expect, it, vi } from "vitest";

import { createTocRevealer, findActiveHeadingId, type HeadingPosition } from "./toc-highlight";

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

describe("createTocRevealer", () => {
  const linkAt = (top: number, bottom: number) => ({ getBoundingClientRect: () => ({ bottom, top }) }) as HTMLElement;
  const railFixture = () =>
    ({
      clientHeight: 750,
      getBoundingClientRect: () => ({ top: 64 }),
      matches: vi.fn().mockReturnValue(false),
      scrollTop: 0,
    }) as unknown as HTMLElement;

  it("reveals an active link below the rail by scrolling only the rail", () => {
    const rail = railFixture();

    createTocRevealer(rail)(linkAt(2818, 2850));

    expect(rail.scrollTop).toBe(2036);
  });

  it("reveals a link clipped above the rail", () => {
    const rail = railFixture();
    rail.scrollTop = 500;

    createTocRevealer(rail)(linkAt(32, 64));

    expect(rail.scrollTop).toBe(468);
  });

  it("leaves a fully visible link and a hidden rail alone", () => {
    const rail = railFixture();

    createTocRevealer(rail)(linkAt(100, 132));
    expect(rail.scrollTop).toBe(0);

    Object.defineProperty(rail, "clientHeight", { value: 0 });
    createTocRevealer(rail)(linkAt(1000, 1032));
    expect(rail.scrollTop).toBe(0);
  });

  it("reveals the current link when the hidden rail becomes visible", () => {
    const rail = railFixture();
    const reveal = createTocRevealer(rail);
    const link = linkAt(2818, 2850);
    Object.defineProperty(rail, "clientHeight", { configurable: true, value: 0 });
    reveal(link);
    Object.defineProperty(rail, "clientHeight", { value: 750 });

    reveal(link);

    expect(rail.scrollTop).toBe(2036);
  });

  it.each([":hover", ":focus-within"])("leaves the rail alone while the reader browses it with %s", (state) => {
    const rail = railFixture();
    vi.mocked(rail.matches).mockImplementation((selector) => selector.includes(state));

    createTocRevealer(rail)(linkAt(2818, 2850));

    expect(rail.scrollTop).toBe(0);
  });

  it("does not pull back to the same active link after a manual rail scroll", () => {
    const rail = railFixture();
    const reveal = createTocRevealer(rail);
    const link = linkAt(2818, 2850);
    reveal(link);
    rail.scrollTop = 100;

    reveal(link);

    expect(rail.scrollTop).toBe(100);
  });

  it("resumes following new active links once the reader leaves the rail", () => {
    const rail = railFixture();
    const reveal = createTocRevealer(rail);
    vi.mocked(rail.matches).mockReturnValue(true);
    reveal(linkAt(1000, 1032));
    vi.mocked(rail.matches).mockReturnValue(false);

    reveal(linkAt(2818, 2850));

    expect(rail.scrollTop).toBe(2036);
  });
});
