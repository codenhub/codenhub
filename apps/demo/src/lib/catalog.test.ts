import { describe, expect, it } from "vitest";

import { demoPackages } from "./catalog";

describe("demoPackages", () => {
  it("discovers @codenhub/icons-demo from the real workspace", () => {
    expect(demoPackages).toContainEqual({ label: "icons", slug: "icons" });
  });

  it("is sorted by slug", () => {
    const slugs = demoPackages.map((demoPackage) => demoPackage.slug);
    expect(slugs).toEqual([...slugs].sort((left, right) => left.localeCompare(right)));
  });
});
