import { describe, expect, it } from "vitest";

import { renderReadme } from "./readme";

const BASE_URL = "https://github.com/codenhub/codenhub/blob/@codenhub/validation@0.4.0/packages/validation/";

describe("renderReadme", () => {
  it("drops the leading title, which the page already shows", async () => {
    const html = await renderReadme("# @codenhub/validation\n\nValidation for data.\n", BASE_URL);

    expect(html).not.toContain("<h1");
    expect(html).toContain("<p>Validation for data.</p>");
  });

  it("points package-relative links at the file in the release", async () => {
    const html = await renderReadme("See [the issue](docs/errors.md#the-issue) and [notice](./NOTICE).\n", BASE_URL);

    expect(html).toContain(`href="${BASE_URL}docs/errors.md#the-issue"`);
    expect(html).toContain(`href="${BASE_URL}NOTICE"`);
  });

  it("leaves absolute links and in-page fragments as written", async () => {
    const html = await renderReadme("[npm](https://www.npmjs.com/) and [usage](#usage).\n", BASE_URL);

    expect(html).toContain('href="https://www.npmjs.com/"');
    expect(html).toContain('href="#usage"');
  });

  it("highlights code blocks", async () => {
    const html = await renderReadme("```ts\nconst a = 1;\n```\n", BASE_URL);

    expect(html).toContain('class="astro-code');
  });
});
