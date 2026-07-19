import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { build } from "astro";
import { beforeAll, describe, expect, it } from "vitest";

const docsRoot = fileURLToPath(new URL("../../", import.meta.url));
const distRoot = new URL("../../dist/", import.meta.url);

async function readOutput(path: string): Promise<string> {
  return readFile(new URL(path, distRoot), "utf8");
}

describe("documentation chrome", () => {
  beforeAll(async () => {
    await build({ logLevel: "silent", root: docsRoot });
  }, 60_000);

  it("includes the package label in package document browser titles", async () => {
    const html = await readOutput("error/index.html");

    expect(html).toContain("<title>Overview | Error | CodenHub</title>");
  });

  it("renders the authored Markdown heading without injecting the frontmatter title", async () => {
    const html = await readOutput("error/index.html");

    expect(html).toContain('<h1 id="normalize-application-errors">Normalize application errors</h1>');
    expect(html).not.toContain("<h1>Overview</h1>");
  });

  it.each(["index.html", "packages/index.html", "error/index.html"])(
    "provides a skip link and main-content target in %s",
    async (path) => {
      const html = await readOutput(path);

      expect(html).toContain('class="skip-link" href="#main-content"');
      expect(html).toMatch(/<main[^>]*id="main-content"/);
    },
  );

  it("shows warning status beside both desktop and mobile package labels", async () => {
    const html = await readOutput("error/index.html");
    const chromeLabels = html.match(/class="package-navigation-title"[^>]*>.*?Error.*?experimental.*?<\/div>/g);

    expect(chromeLabels).toHaveLength(2);
  });

  it("gives every header target a 44px minimum hit area", async () => {
    const css = await readFile(new URL("../styles/global.css", import.meta.url), "utf8");

    expect(css).toMatch(
      /\.brand,\s*\.primary-navigation a,\s*\.header-icon-link,\s*\.theme-toggle\s*\{[^}]*min-height:\s*44px;[^}]*min-width:\s*44px;/s,
    );
  });

  it("uses equal horizontal spacing around every header item", async () => {
    const css = await readFile(new URL("../styles/global.css", import.meta.url), "utf8");

    expect(css).toMatch(
      /\.header-actions,\s*\.header-end,\s*\.primary-navigation\s*\{\s*@apply flex items-center gap-0;\s*\}/s,
    );
    expect(css).toMatch(/\.primary-navigation a,\s*\.header-icon-link,\s*\.theme-toggle\s*\{[^}]*@apply px-3;/s);
  });

  it("uses color and weight only for the active package document", async () => {
    const css = await readFile(new URL("../styles/global.css", import.meta.url), "utf8");
    const activeRule = css.match(/\.document-list a\[aria-current="page"\]\s*\{([^}]*)\}/)?.[1];

    expect(activeRule).toContain("text-text");
    expect(activeRule).toContain("font-semibold");
    expect(activeRule).not.toMatch(/border|\b(?:p|m)l-/);
  });
});
