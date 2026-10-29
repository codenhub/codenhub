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
  route: "/kit/setup/",
  sectionLabel: "Guides",
  title: "Setup guide",
  ...overrides,
});

describe("buildLinkPreviewIndex", () => {
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

  it("clips a long summary at a word boundary", () => {
    const long = `${"word ".repeat(60)}end`;
    const index = buildLinkPreviewIndex([
      { documents: [documentFixture({ html: `<h1>Setup</h1><p>${long}</p>` })], label: "Kit" },
    ]);
    const summary = index["/kit/setup/"]?.summary ?? "";

    expect(summary.length).toBeLessThanOrEqual(201);
    expect(summary).toMatch(/word…$/);
  });

  it("leaves the summary out when there is no paragraph", () => {
    const index = buildLinkPreviewIndex([
      { documents: [documentFixture({ headings: [], html: "<h1>Setup</h1><ul><li>One</li></ul>" })], label: "Kit" },
    ]);

    expect(index["/kit/setup/"]?.summary).toBeUndefined();
  });
});
