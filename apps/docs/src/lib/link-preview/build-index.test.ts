import { describe, expect, it } from "vitest";

import { buildLinkPreviewIndex, type PreviewableDocument } from "./build-index";

const documentFixture = (overrides: Partial<PreviewableDocument> = {}): PreviewableDocument => ({
  headings: [
    { depth: 1, slug: "setup", text: "Setup" },
    { depth: 2, slug: "install", text: "Install" },
  ],
  html: [
    "<h1>Setup</h1>",
    "<p>Get the <code>kit</code> running &amp; ready.</p>",
    "<p>Second paragraph.</p>",
    '<h2 id="install">Install</h2>',
    "<pre><code>pnpm add kit</code></pre>",
    "<p>Add it with your package manager.</p>",
  ].join(""),
  relativePath: "setup.md",
  route: "/kit/setup/",
  sectionLabel: "Guides",
  title: "Setup guide",
  ...overrides,
});

describe("buildLinkPreviewIndex", () => {
  it("previews a reference member by its qualified owner and its own prose", () => {
    const index = buildLinkPreviewIndex([
      {
        label: "ThemeSystem",
        documents: [
          documentFixture({
            headings: [
              { depth: 3, slug: "theme", text: "Theme" },
              { depth: 4, slug: "settokens", text: "setTokens" },
              { depth: 4, slug: "subscribe", text: "subscribe" },
            ],
            html: '<h3 id="theme">Theme</h3><h4 id="settokens">setTokens</h4><pre>setTokens()</pre><p>Updates tokens.</p><h4 id="subscribe">subscribe</h4><p>Subscribe.</p>',
            relativePath: "reference/index.md",
            route: "/theme/reference/",
            title: "@codenhub/theme",
          }),
        ],
      },
    ]);

    expect(index["/theme/reference/#settokens"]).toEqual({
      title: "Theme.setTokens",
      summary: "Updates tokens.",
      trail: ["ThemeSystem", "@codenhub/theme"],
    });
    expect(index["/theme/reference/#theme"]?.summary).toBeUndefined();
  });

  it("summarizes a page by its first paragraph and a section by the first paragraph under it", () => {
    const index = buildLinkPreviewIndex([{ documents: [documentFixture()], label: "Kit" }]);

    expect(index).toEqual({
      "/kit/setup/": { summary: "Get the kit running & ready.", title: "Setup guide", trail: ["Kit", "Guides"] },
      "/kit/setup/#install": {
        summary: "Add it with your package manager.",
        title: "Install",
        trail: ["Kit", "Setup guide"],
      },
    });
  });

  it("prefers a page's description over its first paragraph", () => {
    const index = buildLinkPreviewIndex([
      { documents: [documentFixture({ description: "How to set the kit up." })], label: "Kit" },
    ]);

    expect(index["/kit/setup/"]?.summary).toBe("How to set the kit up.");
  });

  it("shows generic types as plain text in page and section previews", () => {
    const index = buildLinkPreviewIndex([
      {
        documents: [
          documentFixture({
            html: '<p>Returns Result&#60;T&#62;.</p><h2 id="install">Install</h2><p>Creates Ok&#x3C;void> Result.</p>',
          }),
        ],
        label: "Kit",
      },
    ]);

    expect(index["/kit/setup/"]?.summary).toBe("Returns Result<T>.");
    expect(index["/kit/setup/#install"]?.summary).toBe("Creates Ok<void> Result.");
  });

  it("clips a long summary at a word boundary", () => {
    const long = `${"word ".repeat(60)}end`;
    const index = buildLinkPreviewIndex([
      { documents: [documentFixture({ html: `<h1>Setup</h1><p>${long}</p>` })], label: "Kit" },
    ]);
    const summary = index["/kit/setup/"]?.summary ?? "";

    expect(summary.length).toBeLessThanOrEqual(200);
    expect(summary).toMatch(/word…$/);
  });

  it("leaves the summary out when there is no paragraph", () => {
    const index = buildLinkPreviewIndex([
      { documents: [documentFixture({ headings: [], html: "<h1>Setup</h1><ul><li>One</li></ul>" })], label: "Kit" },
    ]);

    expect(index["/kit/setup/"]?.summary).toBeUndefined();
  });
});
