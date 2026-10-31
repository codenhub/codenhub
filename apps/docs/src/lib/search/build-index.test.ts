import { searchDocumentation } from "@codenhub/app-shell/search";
import { describe, expect, it } from "vitest";

import { buildSearchIndex, indexableHeadings, toText, type IndexablePackage } from "./build-index";

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
        relativePath: "tokens.md",
        route: "/styles/tokens/",
        title: "Tokens",
      },
    ],
    label: "Styles",
  },
];

describe("buildSearchIndex", () => {
  it("indexes reference members by qualified owner and ranks a named member first", () => {
    const headings = [
      { depth: 2, slug: "interfaces", text: "Interfaces" },
      { depth: 3, slug: "theme", text: "Theme" },
      { depth: 4, slug: "settokens", text: "setTokens" },
      { depth: 3, slug: "standardschemav1", text: "StandardSchemaV1" },
      { depth: 4, slug: "standardschemav1props", text: "StandardSchemaV1.Props" },
      { depth: 5, slug: "validate", text: "validate" },
      { depth: 6, slug: "input", text: "input" },
      { depth: 3, slug: "other", text: "Other" },
      { depth: 4, slug: "name", text: "name" },
    ];
    const entries = buildSearchIndex([
      {
        label: "ThemeSystem",
        documents: [
          {
            headings,
            html: headings
              .map(({ depth, slug, text }) => `<h${depth} id="${slug}">${text}</h${depth}><p>Details for ${text}.</p>`)
              .join(""),
            relativePath: "reference/index.md",
            route: "/theme/reference/",
            title: "@codenhub/theme",
          },
        ],
      },
    ]);

    expect(entries.map(({ section }) => section)).toEqual([
      undefined,
      "Interfaces",
      "Theme",
      "Theme.setTokens",
      "StandardSchemaV1",
      "StandardSchemaV1.Props",
      "StandardSchemaV1.Props.validate",
      "StandardSchemaV1.Props.validate.input",
      "Other",
      "Other.name",
    ]);
    expect(entries.find(({ section }) => section === "Theme")?.text).toBe("Details for Theme.");
    expect(searchDocumentation(entries, "setTokens")[0]?.entry).toMatchObject({
      route: "/theme/reference/#settokens",
      section: "Theme.setTokens",
      text: "Details for setTokens.",
    });
  });

  it("labels a generated member heading by its dotted name without qualifying it again", () => {
    const headings = [
      { depth: 3, slug: "lookup", text: "Lookup" },
      { depth: 4, slug: "lookup--get", text: "Lookup › get" },
      { depth: 5, slug: "remarks", text: "Remarks" },
      { depth: 4, slug: "lookup-index-signature", text: "Lookup index signature" },
    ];

    expect(indexableHeadings({ headings, relativePath: "reference/index.md" }).map(({ text }) => text)).toEqual([
      "Lookup",
      "Lookup.get",
      "Lookup.get.Remarks",
      "Lookup index signature",
    ]);
  });

  it("keeps deeper guide headings in their parent section's search body", () => {
    const entries = buildSearchIndex([
      {
        label: "Kit",
        documents: [
          {
            headings: [
              { depth: 3, slug: "setup", text: "Setup" },
              { depth: 4, slug: "advanced", text: "Advanced" },
            ],
            html: '<h3 id="setup">Setup</h3><p>Start here.</p><h4 id="advanced">Advanced</h4><p>More details.</p>',
            relativePath: "guides/setup.md",
            route: "/kit/setup/",
            title: "Setup",
          },
        ],
      },
    ]);

    expect(entries).toHaveLength(2);
    expect(entries[1]?.text).toBe("Start here. Advanced More details.");
  });

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

  it("decodes numeric references in document and section search bodies", () => {
    const entries = buildSearchIndex([
      {
        documents: [
          {
            headings: [{ depth: 3, slug: "ok", text: "ok" }],
            html: '<p>Returns Result&#60;void&#62;.</p><h3 id="ok">ok</h3><p>Creates Ok&#x3C;void&#x3e;.</p>',
            relativePath: "reference/index.md",
            route: "/error/reference/",
            title: "@codenhub/error",
          },
        ],
        label: "ErrorKit",
      },
    ]);

    expect(entries.map(({ text }) => text)).toEqual(["Returns Result<void>.", "Creates Ok<void>."]);
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
            relativePath: "reference.md",
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

describe("toText", () => {
  it("decodes named, decimal, and hexadecimal references after stripping markup", () => {
    expect(toText("<p>&lt;T&gt; &quot;value&quot; &#39;ok&#39;&nbsp;&amp; &#60;U&#62; &#X1F680;</p>")).toBe(
      "<T> \"value\" 'ok' & <U> 🚀",
    );
  });

  it("decodes each reference only once", () => {
    expect(toText("<p>&amp;#x3C; &#38;lt; &#x26;#60;</p>")).toBe("&#x3C; &lt; &#60;");
  });

  it("keeps highlighted code contiguous so a signature fragment is searchable", () => {
    const html =
      '<figure class="code-block"><figcaption class="code-block-header">TypeScript<button aria-label="Copy TypeScript code"></button></figcaption>' +
      '<pre><code><span class="line"><span>Readonly</span><span>&#x3C;</span><span>ErrorFeedback</span><span>></span>;</span></code></pre></figure>' +
      "<p>Returns <code>AppError</code>.</p>";
    expect(toText(html)).toBe("Readonly<ErrorFeedback>; Returns AppError.");
  });

  it("replaces invalid Unicode references without throwing", () => {
    expect(toText("<p>&#0; &#xD800; &#1114112;</p>")).toBe("� � �");
  });

  it("never joins the text around a removed tag into a new tag", () => {
    expect(toText("<<span>script alert(1)")).not.toContain("<script");
  });
});
