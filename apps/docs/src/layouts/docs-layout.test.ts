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
    const html = await readOutput("i18n/index.html");
    // The badge renders as an icon, so its accessible name is what carries the
    // status to a screen reader and is what this asserts.
    const chromeLabels = html.match(
      /class="package-navigation-title"[^>]*>.*?Internationalization.*?Experimental.*?<\/div>/g,
    );

    expect(chromeLabels).toHaveLength(2);
    expect(html).toContain('<span class="sr-only">Experimental</span>');
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

  it("draws one rule when a section heading follows an authored thematic break", async () => {
    const css = await readFile(new URL("../styles/global.css", import.meta.url), "utf8");
    const html = await readOutput("icons/index.html");

    // The icons overview authors `---` before its `##` headings, which is what
    // produced a doubled rule against the heading's own border.
    expect(html).toMatch(/<hr>\s*<h2/);
    expect(css).toMatch(/\.markdown-content hr:has\(\+ h2\)\s*\{[^}]*hidden/s);
  });

  it("leaves the page as the only scroll container", async () => {
    const css = await readFile(new URL("../styles/global.css", import.meta.url), "utf8");
    const docColRule = css.match(/\.document-column\s*\{([^}]*)\}/)?.[1];

    // A scrolling document column puts the scrollbar between the rails instead
    // of at the edge of the window, and hides the page scrollbar to get there.
    expect(docColRule).not.toContain("overflow");
    expect(css).not.toMatch(/overflow:\s*hidden/);
  });

  it("sticks each rail panel below the header without clipping its divider", async () => {
    const css = await readFile(new URL("../styles/global.css", import.meta.url), "utf8");
    const stickyRule = css.match(/\.left-rail > \*,\s*\.toc-rail > \*\s*\{([^}]*)\}/)?.[1];

    // The divider belongs to the rail itself so it runs the full document, while
    // the panel inside sticks and scrolls only once it outgrows the viewport.
    expect(stickyRule).toContain("sticky");
    expect(stickyRule).toContain("overflow-y-auto");
    expect(stickyRule).toContain("top: var(--docs-header-height)");
    expect(css).toMatch(/\.left-rail\s*\{[^}]*border-r/s);
  });

  it("draws the table-of-contents rule and its indicator as one line", async () => {
    const css = await readFile(new URL("../styles/global.css", import.meta.url), "utf8");
    const railRule = css.match(/\.toc-rail\s*\{([^}]*)\}/)?.[1];
    const linkRule = css.match(/\.toc-rail a\s*\{([^}]*)\}/)?.[1];

    // A border on the rail as well would sit beside the entries' own rule as a
    // second parallel line instead of merging with it.
    expect(railRule).not.toContain("border");
    expect(linkRule).toContain("border-l-2");
    expect(css).toMatch(/\.toc-rail a\[aria-current="true"\]\s*\{[^}]*border-primary/s);
  });

  it("keeps the search trigger clear of the header's outlined controls", async () => {
    const css = await readFile(new URL("../styles/search.css", import.meta.url), "utf8");
    const triggerRule = css.match(/\.search-trigger\s*\{([^}]*)\}/)?.[1];

    // A border and a 44px floor turn the trigger into a form field sitting in a
    // header where nothing else is boxed.
    expect(triggerRule).not.toMatch(/\bborder\b/);
    expect(triggerRule).not.toContain("44px");
  });

  it("emits a search index covering package sections", async () => {
    const entries = JSON.parse(await readOutput("search-index.json")) as {
      route: string;
      section?: string;
      text: string;
    }[];
    const presentation = entries.find((entry) => entry.route === "/styles/tokens/#presentation-tokens");

    expect(presentation?.section).toBe("Presentation Tokens");
    expect(presentation?.text).toContain("Presentation tokens describe");
    expect(entries.some((entry) => entry.route === "/error/")).toBe(true);
  });

  it("puts a search trigger with its shortcut in the header", async () => {
    const html = await readOutput("error/index.html");

    expect(html).toMatch(/<button[^>]*data-search-trigger/);
    expect(html).toContain('aria-keyshortcuts="Control+K"');
    expect(html).toMatch(/<dialog[^>]*data-search-dialog/);
  });

  it("offsets heading anchors through scroll padding alone", async () => {
    const css = await readFile(new URL("../styles/global.css", import.meta.url), "utf8");
    const headingRules = css.match(/\.markdown-content h[23]\s*\{[^}]*\}/g) ?? [];

    // `html` reserves the sticky header, so a scroll margin here would stack on
    // top of it and drop every anchored heading too far down the viewport.
    expect(headingRules).toHaveLength(2);
    expect(css).toMatch(/html\s*\{[^}]*scroll-padding-top:/s);

    for (const rule of headingRules) {
      expect(rule).not.toContain("scroll-mt");
    }
  });
});
