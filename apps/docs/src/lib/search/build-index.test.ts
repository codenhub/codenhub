import { describe, expect, it } from "vitest";

import { buildSearchIndex, type IndexablePackage } from "./build-index";

const packages: IndexablePackage[] = [
  {
    documents: [
      {
        headings: [
          { depth: 1, slug: "design-tokens", text: "Design tokens" },
          { depth: 2, slug: "color-tokens", text: "Color Tokens" },
          { depth: 3, slug: "hover", text: "Hover" },
        ],
        html: [
          '<h1 id="design-tokens">Design tokens</h1>',
          "<p>Tokens are CSS custom &amp; foundation properties.</p>",
          '<h2 id="color-tokens"><a class="heading-anchor" href="#color-tokens"></a>Color Tokens</h2>',
          "<p>Primary action color.</p>",
          '<h3 id="hover">Hover</h3>',
          "<p>Primary hover state.</p>",
        ].join("\n"),
        route: "/styles/tokens/",
        title: "Tokens",
      },
    ],
    label: "Styles",
  },
];

describe("buildSearchIndex", () => {
  it("emits one entry per document plus one per section", () => {
    expect(buildSearchIndex(packages).map((entry) => entry.route)).toEqual([
      "/styles/tokens/",
      "/styles/tokens/#color-tokens",
      "/styles/tokens/#hover",
    ]);
  });

  it("gives the document entry the prose above the first section", () => {
    const [documentEntry] = buildSearchIndex(packages);

    expect(documentEntry?.section).toBeUndefined();
    expect(documentEntry?.text).toBe("Design tokens Tokens are CSS custom & foundation properties.");
  });

  it("stops a section's prose at the next heading", () => {
    const [, colorTokens] = buildSearchIndex(packages);

    expect(colorTokens?.section).toBe("Color Tokens");
    expect(colorTokens?.text).toBe("Primary action color.");
  });

  it("labels a section from its parsed heading, not its compiled markup", () => {
    const entries = buildSearchIndex([
      {
        documents: [
          {
            headings: [{ depth: 2, slug: "i18ntlocale", text: "I18n<TLocale>" }],
            // An id may hold `>` and the heading may wrap its text in an anchor,
            // both of which defeat reading the label out of the tag itself.
            html: '<h2 id="i18n&#x3C;tlocale>"><a class="heading-anchor" href="#i18ntlocale"></a>I18n&#x3C;TLocale></h2><p>Typed locale.</p>',
            route: "/ui-kit/reference/",
            title: "Reference",
          },
        ],
        label: "UI Kit",
      },
    ]);

    expect(entries[1]).toMatchObject({
      route: "/ui-kit/reference/#i18ntlocale",
      section: "I18n<TLocale>",
      text: "Typed locale.",
    });
  });

  it("carries the package label and document title onto every section", () => {
    for (const entry of buildSearchIndex(packages)) {
      expect(entry.packageLabel).toBe("Styles");
      expect(entry.title).toBe("Tokens");
    }
  });
});
