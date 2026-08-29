import { describe, expect, it } from "vitest";

import { demoPackages } from "./catalog";

describe("demoPackages", () => {
  it("discovers @codenhub/icons-demo from the real workspace, enriched from @codenhub/icons's own manifest", () => {
    expect(demoPackages).toContainEqual({
      description: "Icon registry, CSS mask generator, and scanner module for Codenhub icon system.",
      docsUrl: "https://docs.codenhub.dev/icons/",
      githubUrl: "https://github.com/codenhub/codenhub/tree/main/packages/icons",
      label: "IconKit",
      npmUrl: "https://www.npmjs.com/package/@codenhub/icons",
      slug: "icons",
      status: "experimental",
    });
  });

  it("is sorted by label", () => {
    const labels = demoPackages.map((demoPackage) => demoPackage.label);
    expect(labels).toEqual([...labels].sort((left, right) => left.localeCompare(right)));
  });
});
