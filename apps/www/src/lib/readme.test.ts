import { describe, expect, it } from "vitest";

import { renderReadme, selectReadme } from "./readme";

const BASE_URL = "https://github.com/codenhub/codenhub/blob/@codenhub/validation@0.4.0/packages/validation/";
const IMAGE_BASE_URL = "https://github.com/codenhub/codenhub/raw/@codenhub/validation@0.4.0/packages/validation/";
const BASES = { baseUrl: BASE_URL, imageBaseUrl: IMAGE_BASE_URL };

describe("selectReadme", () => {
  const readme = { source: "# English", translations: { "pt-BR": "# Português" } };

  it("shows the release's README in the page's locale when it carries one", () => {
    expect(selectReadme(readme, "pt-BR")).toEqual({ lang: "pt-BR", source: "# Português" });
  });

  it("falls back to the English README in a locale the release does not translate it to", () => {
    expect(selectReadme(readme, "es")).toEqual({ lang: "en", source: "# English" });
    expect(selectReadme(readme, "en")).toEqual({ lang: "en", source: "# English" });
  });
});

describe("renderReadme", () => {
  it("keeps the leading title as a section heading that looks like a title", async () => {
    const html = await renderReadme("# @codenhub/validation\n\nValidation for data.\n", BASES);

    expect(html).not.toContain("<h1");
    expect(html).toMatch(/<h2 class="package-readme-title"[^>]*>@codenhub\/validation<\/h2>/u);
    expect(html).toContain("<p>Validation for data.</p>");
  });

  it("keeps a translated README's title a section heading under its source line", async () => {
    const html = await renderReadme(
      "<!-- source: 783c4dee7188267518be702367f3a8cfe8476b67 -->\n\n# @codenhub/validation\n\nValidação de dados.\n",
      BASES,
    );

    expect(html).not.toContain("<h1");
    expect(html).not.toContain("source:");
    expect(html).toMatch(/^<h2 class="package-readme-title"[^>]*>@codenhub\/validation<\/h2>/u);
  });

  it("demotes the leading H1 when preceded by a non-source HTML comment, but not after visible HTML", async () => {
    const withComment = await renderReadme("<!-- note -->\n\n# @codenhub/validation\n\nValidação de dados.\n", BASES);

    expect(withComment).not.toContain("<h1");
    expect(withComment).toContain("<!-- note -->");
    expect(withComment).toMatch(/<h2 class="package-readme-title"[^>]*>@codenhub\/validation<\/h2>/u);

    const withVisibleHtml = await renderReadme("<p>Banner</p>\n\n# @codenhub/validation\n", BASES);

    expect(withVisibleHtml).toContain("<h1");
  });

  it("points package-relative links at the file in the release", async () => {
    const html = await renderReadme("See [the issue](docs/errors.md#the-issue) and [notice](./NOTICE).\n", BASES);

    expect(html).toContain(`href="${BASE_URL}docs/errors.md#the-issue"`);
    expect(html).toContain(`href="${BASE_URL}NOTICE"`);
  });

  it("leaves absolute links and in-page fragments as written", async () => {
    const html = await renderReadme("[npm](https://www.npmjs.com/) and [usage](#usage).\n", BASES);

    expect(html).toContain('href="https://www.npmjs.com/"');
    expect(html).toContain('href="#usage"');
  });

  it("renders GitHub-style alerts as the documentation site does", async () => {
    const html = await renderReadme("> [!WARNING]\n> Breaking change.\n", BASES);

    expect(html).not.toContain("[!WARNING]");
    expect(html).toMatch(/<aside class="markdown-alert alert warning" data-alert-type="warning">/u);
    expect(html).toMatch(/<p class="markdown-alert-title">.*Warning<\/p>/su);
    expect(html).toContain("<p>Breaking change.</p>");
  });

  it("highlights code blocks", async () => {
    const html = await renderReadme("```ts\nconst a = 1;\n```\n", BASES);

    expect(html).toContain('class="astro-code');
  });

  it("points package-relative images at the file's raw bytes, not its viewer", async () => {
    const html = await renderReadme(
      "![inline](docs/a.svg) ![by reference][b] [a link][c]\n\n[b]: docs/b.svg\n[c]: docs/c.md\n",
      BASES,
    );

    expect(html).toContain(`src="${IMAGE_BASE_URL}docs/a.svg"`);
    expect(html).toContain(`src="${IMAGE_BASE_URL}docs/b.svg"`);
    expect(html).toContain(`href="${BASE_URL}docs/c.md"`);
  });
});
