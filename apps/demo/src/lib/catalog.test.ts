import { describe, expect, it } from "vitest";

import { demoSlugs } from "./catalog";

describe("demoSlugs", () => {
  it("discovers the slug of every package that ships a demo/ directory", () => {
    // Exact, so a demo that stops being discovered fails here. Adding a demo
    // also means naming it in apps/demo/package.json; update both together.
    expect(demoSlugs).toEqual(["icons", "styles", "theme", "toaster"]);
  });

  it("is sorted so the sitemap is stable across builds", () => {
    expect(demoSlugs).toEqual([...demoSlugs].sort());
  });

  it("contains no duplicate slugs", () => {
    expect(new Set(demoSlugs).size).toBe(demoSlugs.length);
  });
});
