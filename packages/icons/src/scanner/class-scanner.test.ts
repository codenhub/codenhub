import { describe, expect, it } from "vitest";

import { scanIconClasses } from "./class-scanner.js";

describe("class-scanner", () => {
  it("should extract ic-* classes from HTML string", () => {
    const html = '<button class="btn ic-close ic-search"></button>';
    const found = scanIconClasses(html);
    expect(Array.from(found)).toEqual(["ic-close", "ic-search"]);
  });

  it("should support custom prefix", () => {
    const html = '<div class="icon-heart icon-star"></div>';
    const found = scanIconClasses(html, { prefix: "icon" });
    expect(Array.from(found)).toEqual(["icon-heart", "icon-star"]);
  });

  it("should return empty set when no icon classes found", () => {
    const html = '<div class="normal-class"></div>';
    const found = scanIconClasses(html);
    expect(found.size).toBe(0);
  });
});
