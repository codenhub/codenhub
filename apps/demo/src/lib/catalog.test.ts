import { describe, expect, it } from "vitest";

import { demoSlugs } from "./catalog";

describe("demoSlugs", () => {
  it("discovers the slug of every package that ships a demo/ directory", () => {
    expect(demoSlugs).toEqual(expect.arrayContaining(["icons", "styles", "theme", "toaster"]));
  });

  it("is sorted so the sitemap is stable across builds", () => {
    expect(demoSlugs).toEqual([...demoSlugs].sort());
  });

  it("contains no duplicate slugs", () => {
    expect(new Set(demoSlugs).size).toBe(demoSlugs.length);
  });
});
