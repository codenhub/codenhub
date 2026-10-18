import { describe, expect, it } from "vitest";

import { renderReadme } from "./readme";

const BASE_URL = "https://github.com/codenhub/codenhub/blob/@codenhub/validation@0.4.0/packages/validation/";
const IMAGE_BASE_URL = "https://github.com/codenhub/codenhub/raw/@codenhub/validation@0.4.0/packages/validation/";
const BASES = { baseUrl: BASE_URL, imageBaseUrl: IMAGE_BASE_URL };

describe("renderReadme", () => {
  it("keeps the leading title as a section heading that looks like a title", async () => {
    const html = await renderReadme("# @codenhub/validation\n\nValidation for data.\n", BASES);

    expect(html).not.toContain("<h1");
    expect(html).toMatch(/<h2 class="package-readme-title"[^>]*>@codenhub\/validation<\/h2>/u);
    expect(html).toContain("<p>Validation for data.</p>");
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
