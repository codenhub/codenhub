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

    expect(html).toContain("<title>Overview | ErrorKit | CodenHub</title>");
  });

  it("renders the authored Markdown heading without injecting the frontmatter title", async () => {
    const html = await readOutput("error/index.html");

    expect(html).toContain('<h1 id="normalize-application-errors">Normalize application errors</h1>');
    expect(html).not.toContain("<h1>Overview</h1>");
  });

  it("titles a generated reference page by its import specifier, not the terse sidebar title", async () => {
    const html = await readOutput("error/reference/index.html");

    expect(html).toContain("<title>@codenhub/error | ErrorKit | CodenHub</title>");
    expect(html).toContain('<h1 id="codenhuberror">@codenhub/error</h1>');
  });

  it("renders a generated reference page's description as a deck directly below the H1", async () => {
    const html = await readOutput("error/reference/index.html");
    const deck =
      '<div class="reference-deck"><p class="reference-summary">Typed error normalization, result helpers, and the error registry.</p></div>';

    expect(html).toContain(`</h1>${deck}`);
  });

  it("leaves a hand-authored page's description as metadata only", async () => {
    const html = await readOutput("icons/index.html");

    expect(html).toContain('name="description"');
    expect(html).not.toContain("reference-deck");
  });

  it("shows a section strip that marks the tab holding the current page", async () => {
    const overview = await readOutput("error/index.html");
    const reference = await readOutput("error/reference/index.html");

    // Both pages carry the same two-tab strip, each row an icon then its label;
    // only the current tab is marked.
    for (const html of [overview, reference]) {
      expect(html).toMatch(
        /<a class="package-tab"(?: aria-current="page")? href="\/error\/">\s*<svg[\s\S]*?<\/svg>\s*Guides\s*<\/a>/,
      );
      expect(html).toMatch(
        /<a class="package-tab"(?: aria-current="page")? href="\/error\/reference\/">\s*<svg[\s\S]*?<\/svg>\s*Reference\s*<\/a>/,
      );
    }
    expect(overview).toMatch(/<a class="package-tab" aria-current="page" href="\/error\/">/);
    expect(reference).toMatch(/<a class="package-tab" aria-current="page" href="\/error\/reference\/">/);
  });

  it("omits the section strip for a package that has only guides", async () => {
    const html = await readOutput("validation/index.html");

    expect(html).not.toContain("package-tab");
  });

  it.each(["index.html", "error/index.html"])("provides a skip link and main-content target in %s", async (path) => {
    const html = await readOutput(path);

    expect(html).toContain('class="skip-link" href="#main-content"');
    expect(html).toMatch(/<main[^>]*id="main-content"/);
  });

  it("shows warning status beside both desktop and mobile package labels", async () => {
    const html = await readOutput("validation/index.html");
    // The badge renders as an icon, so its accessible name is what carries the
    // status to a screen reader and is what this asserts.
    const chromeLabels = html.match(/class="package-navigation-title"[^>]*>.*?ValidationKit.*?Experimental.*?<\/div>/g);

    expect(chromeLabels).toHaveLength(2);
    expect(html).toContain('<span class="sr-only">Experimental</span>');
  });

  it("groups a package's folder pages into collapsible sections, open on the active one", async () => {
    const html = await readOutput("styles/usage/buttons/index.html");

    // The folder holding the current page is expanded; a sibling folder is not.
    expect(html).toContain('<details class="nav-group" open>');
    expect(html).toContain('<details class="nav-group">');
    expect(html).toMatch(/<summary>\s*Usage[\s\S]*?nav-group-caret[\s\S]*?<\/summary>/);

    // Root pages still render as plain links, before any group.
    const listStart = html.slice(html.indexOf('class="document-list"'));
    expect(listStart.search(/>\s*Introduction\s*</)).toBeLessThan(listStart.indexOf("nav-group"));

    // The folder index sits inside its group under its own title, not at the root.
    // Its title is "Overview" (not "Usage") so the sidebar link doesn't repeat the
    // group label right above it; see packages/styles/docs/usage/index.md.
    expect(listStart).toMatch(/nav-group[\s\S]*?href="\/styles\/usage\/"[^>]*>\s*Overview\s*<\/a>/);
  });

  it("renders a Markdown table with the Codenhub table styling and an overflow wrapper", async () => {
    const html = await readOutput("styles/usage/buttons/index.html");
    const css = await readFile(new URL("../styles/global.css", import.meta.url), "utf8");

    expect(html).toMatch(/<div class="table-wrap">\s*<table class="edged ruled">\s*<thead>/);
    expect(css).toMatch(/\.markdown-content table\s*\{\s*@apply data-table;\s*\}/s);
  });

  it("gives every header target a 44px minimum hit area", async () => {
    const css = await readFile(new URL("../styles/global.css", import.meta.url), "utf8");

    expect(css).toMatch(
      /\.brand,\s*\.header-icon-link,\s*\.theme-toggle\s*\{[^}]*min-height:\s*44px;[^}]*min-width:\s*44px;/s,
    );
  });

  it("uses equal horizontal spacing around every header item", async () => {
    const css = await readFile(new URL("../styles/global.css", import.meta.url), "utf8");

    expect(css).toMatch(/\.header-actions,\s*\.header-end\s*\{\s*@apply flex items-center gap-0;\s*\}/s);
    expect(css).toMatch(/\.header-icon-link,\s*\.theme-toggle\s*\{[^}]*@apply px-3;/s);
  });

  it("marks the active package document like the table of contents marks its own", async () => {
    const css = await readFile(new URL("../styles/global.css", import.meta.url), "utf8");
    const activeRule = css.match(/\.document-list a\[aria-current="page"\]\s*\{([^}]*)\}/)?.[1];
    const tocActiveRule = css.match(/\.toc-rail a\[aria-current="true"\]\s*\{([^}]*)\}/)?.[1];

    expect(activeRule).toContain("text-text");
    expect(activeRule).toContain("font-semibold");
    // Same segment-on-the-rail-rule treatment as the table of contents.
    expect(activeRule).toContain("border-primary");
    expect(tocActiveRule).toContain("border-primary");
    expect(css).toMatch(/\.left-rail::before\s*\{[^}]*right-0/s);
  });

  it("hides a thematic break that directly precedes a section heading", async () => {
    const css = await readFile(new URL("../styles/global.css", import.meta.url), "utf8");

    // An authored `---` before a `##` renders an `<hr>` that would otherwise
    // double a rule against the heading's own border, so the stylesheet hides it.
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

  it("runs each rail divider the full document while only its panel scrolls", async () => {
    const css = await readFile(new URL("../styles/global.css", import.meta.url), "utf8");
    const stickyRule = css.match(/\.left-rail > \*,\s*\.toc-rail > \*\s*\{([^}]*)\}/)?.[1];

    // Each divider is a positioned line on the rail, not a border on the
    // scrolling panel, so a current-entry segment paints over it uncut. The
    // panel inside sticks and scrolls only once it outgrows the viewport.
    expect(stickyRule).toContain("sticky");
    expect(stickyRule).toContain("overflow-y-auto");
    expect(stickyRule).toContain("top: var(--docs-header-height)");
    expect(css).toMatch(/\.left-rail::before\s*\{[^}]*inset-y-0/s);
    expect(css).toMatch(/\.left-rail::before\s*\{[^}]*right-0/s);
  });

  it("draws the table-of-contents rule and its indicator as one line", async () => {
    const css = await readFile(new URL("../styles/global.css", import.meta.url), "utf8");
    const railRule = css.match(/\.toc-rail\s*\{([^}]*)\}/)?.[1];
    const ruleLine = css.match(/\.toc-rail::before\s*\{([^}]*)\}/)?.[1];
    const alignmentRule = css.match(/\.toc-rail \.rail-title,\s*\.toc-rail a\s*\{([^}]*)\}/)?.[1];

    // The rule spans the rail and every entry reserves its width at the same
    // edge, so a current entry's segment lands on it rather than beside it as a
    // second parallel line. A border on the rail instead of a positioned line
    // would be unreachable: the panel between them clips its own overflow.
    expect(railRule).toContain("pl-0");
    expect(railRule).not.toContain("border");
    expect(ruleLine).toContain("inset-y-0");
    expect(ruleLine).toContain("left-0");
    expect(alignmentRule).toContain("border-l-2");
    expect(alignmentRule).toContain("border-transparent");
    expect(css).toMatch(/\.toc-rail a\[aria-current="true"\]\s*\{[^}]*border-primary/s);
  });

  it("edges the search trigger with the app's shared input border", async () => {
    const css = await readFile(new URL("../styles/search.css", import.meta.url), "utf8");
    const triggerRule = css.match(/\.search-trigger\s*\{([^}]*)\}/)?.[1];

    // It carries the shared border token and the plain `border` utility, so it
    // reads like the catalog's package filter. Still no 44px floor: it stays as
    // tall as the header's icon buttons rather than growing into a form control.
    expect(triggerRule).toMatch(/\bborder-border\b/);
    expect(triggerRule).toMatch(/\bborder\b(?!-)/);
    expect(triggerRule).not.toContain("44px");
  });

  it("builds the not-found page the deployment is configured to serve", async () => {
    const html = await readOutput("404.html");
    const config = await readFile(new URL("../../wrangler.jsonc", import.meta.url), "utf8");

    // `not_found_handling` names a file rather than pointing at one, so nothing
    // fails at deploy time if the page stops being built.
    expect(html).toContain("Page not found");
    expect(config).toContain('"not_found_handling": "404-page"');
    expect(config).toContain('"directory": "./dist"');
  });

  it("emits a search index covering package sections", async () => {
    const entries = JSON.parse(await readOutput("search-index.json")) as {
      route: string;
      section?: string;
      text: string;
    }[];
    const presentation = entries.find((entry) => entry.route === "/styles/usage/customizing/#presentation-tokens");

    expect(presentation?.section).toBe("Presentation tokens");
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
