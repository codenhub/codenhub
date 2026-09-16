import { describe, expect, it } from "vitest";

import { demoPackages } from "./catalog";

describe("demoPackages", () => {
  it("discovers @codenhub/icons-demo from the real workspace, enriched from @codenhub/icons's own manifest", () => {
    expect(demoPackages).toContainEqual({
      description: "Icon registry, CSS mask generator, and scanner module for Codenhub icon system.",
      label: "IconKit",
      slug: "icons",
      status: "active",
    });
  });

  it("discovers @codenhub/styles-demo from the real workspace, enriched from @codenhub/styles's own manifest", () => {
    expect(demoPackages).toContainEqual({
      description: "CSS-only Codenhub design tokens, base styles, and composable UI helper classes.",
      label: "StyleKit",
      slug: "styles",
      status: "active",
    });
  });

  it("discovers @codenhub/theme-demo from the real workspace, enriched from @codenhub/theme's own manifest", () => {
    expect(demoPackages).toContainEqual({
      description: "Zero-dependency browser theme preference helper for TypeScript apps.",
      label: "ThemeSystem",
      slug: "theme",
      status: "active",
    });
  });

  it("discovers @codenhub/toaster-demo from the real workspace, enriched from @codenhub/toaster's own manifest", () => {
    expect(demoPackages).toContainEqual({
      description:
        "Instance-based browser toast and native dialog manager with accessible semantic, loading, and custom notifications.",
      label: "Toaster",
      slug: "toaster",
      status: "experimental",
    });
  });

  it("is sorted by label", () => {
    const labels = demoPackages.map((demoPackage) => demoPackage.label);
    expect(labels).toEqual([...labels].sort((left, right) => left.localeCompare(right)));
  });
});
