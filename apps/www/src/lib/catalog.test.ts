import { describe, expect, it } from "vitest";

import { catalogPackages, documentedCount } from "./catalog";

describe("catalogPackages", () => {
  it("enriches a documented package with its GitHub, npm, and docs links", () => {
    const icons = catalogPackages.find((entry) => entry.name === "@codenhub/icons");

    expect(icons).toMatchObject({
      label: "IconKit",
      documentationRoute: "/icons/",
      githubUrl: "https://github.com/codenhub/codenhub/tree/main/packages/icons",
      npmUrl: "https://www.npmjs.com/package/@codenhub/icons",
      docsUrl: "https://docs.codenhub.dev/icons/",
    });
  });

  it("omits private and unlisted packages", () => {
    expect(catalogPackages.some((entry) => entry.name === "@codenhub/tools")).toBe(false);
    expect(catalogPackages.some((entry) => entry.name === "@codenhub/ui-kit")).toBe(false);
  });

  it("counts only packages that publish documentation", () => {
    expect(documentedCount).toBe(catalogPackages.filter((entry) => entry.documentationRoute !== undefined).length);
    expect(documentedCount).toBeGreaterThan(0);
  });

  it("is ordered by label, matching buildPublicPackageSummaries", () => {
    // The summary builder orders with plain `<`/`>` comparison, not
    // `localeCompare`, so a lowercase name like "i18n" sorts after "Vite Icons".
    const labels = catalogPackages.map((entry) => entry.label);
    expect(labels).toEqual([...labels].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)));
  });
});
