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
  }, 120_000);

  it("includes the package label in package document browser titles", async () => {
    const html = await readOutput("error/index.html");

    expect(html).toContain("<title>Overview | ErrorKit | CodenHub</title>");
  });

  it("renders the authored Markdown heading without injecting the frontmatter title", async () => {
    const html = await readOutput("error/index.html");

    expect(html).toContain(
      '<h1 id="turn-whatever-you-caught-into-an-error-you-can-use">Turn whatever you caught into an error you can use</h1>',
    );
    expect(html).not.toContain("<h1>Overview</h1>");
  });

  it("titles a generated reference page by its import specifier, not the terse sidebar title", async () => {
    const html = await readOutput("error/reference/index.html");

    expect(html).toContain("<title>@codenhub/error | ErrorKit | CodenHub</title>");
    // The `<wbr>` lets the specifier wrap after its slash rather than inside a word.
    expect(html).toContain('<h1 id="codenhuberror" class="reference-title">@codenhub/<wbr>error</h1>');
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

  it("shows a section strip that marks only the tab holding the current page", async () => {
    const overview = await readOutput("error/index.html");
    const reference = await readOutput("error/reference/index.html");

    // Both pages carry the same two-tab strip, each row an icon then its label.
    for (const html of [overview, reference]) {
      expect(html).toMatch(
        /<a class="package-tab"(?: aria-current="location")? href="\/error\/">\s*<svg[\s\S]*?<\/svg>\s*Guides\s*<\/a>/,
      );
      expect(html).toMatch(
        /<a class="package-tab"(?: aria-current="location")? href="\/error\/reference\/">\s*<svg[\s\S]*?<\/svg>\s*Reference\s*<\/a>/,
      );
    }

    // The tab is `location`, not `page`: the reader may be on a nested page of
    // the section, and the exact document link carries `page`. Exactly one tab
    // is marked on each page.
    expect(overview).toMatch(/<a class="package-tab" aria-current="location" href="\/error\/">/);
    expect(overview).toMatch(/<a class="package-tab" href="\/error\/reference\/">/);
    expect(reference).toMatch(/<a class="package-tab" aria-current="location" href="\/error\/reference\/">/);
    expect(reference).toMatch(/<a class="package-tab" href="\/error\/">/);
  });

  it("omits the section strip for a package that has only guides", async () => {
    const html = await readOutput("store/index.html");

    expect(html).not.toContain("package-tab");
  });

  it("provides a skip link and main-content target", async () => {
    const html = await readOutput("error/index.html");

    expect(html).toContain('class="shell-skip-link" href="#main-content"');
    expect(html).toMatch(/<main[^>]*id="main-content"/);
  });

  it.each(["theme/reference/index.html", "styles/usage/customizing/index.html"])(
    "offers a closed phone outline matching the desktop outline on %s",
    async (path) => {
      const html = await readOutput(path);
      const mobile = html.match(/<div class="page-outline">([\s\S]*?)<\/nav>\s*<\/div>/)?.[1];
      const desktop = html.match(/<nav aria-label="On this page" data-toc>([\s\S]*?)<\/nav>/)?.[1];

      expect(mobile).toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="page-outline-links"/);
      expect(mobile).toMatch(/<nav[^>]*id="page-outline-links"[^>]*hidden/);
      const links = (markup: string | undefined) =>
        [...(markup ?? "").matchAll(/<a href="#[^"]+">[^<]*<\/a>/g)].map(([link]) => link);
      expect(links(mobile).length).toBeGreaterThan(0);
      expect(links(mobile)).toEqual(links(desktop));
    },
  );

  it("shows the phone outline at the breakpoint that hides the desktop rail", async () => {
    const css = await readFile(new URL("../styles/global.css", import.meta.url), "utf8");

    expect(css).toMatch(/\.page-outline\s*\{[^}]*hidden/s);
    expect(css).toMatch(/@media \(max-width: 74rem\)[\s\S]*?\.page-outline\s*\{[^}]*block/s);
  });

  it("renders the shared app-shell chrome", async () => {
    const html = await readOutput("error/index.html");

    // Header, footer, and theme toggle come from `@codenhub/app-shell`; this app
    // supplies only the search trigger in the header's actions slot.
    expect(html).toMatch(/<header class="shell-header">/);
    expect(html).toMatch(/<footer class="shell-footer">/);
    expect(html).toMatch(/<button[^>]*data-theme-toggle/);
  });

  it("shows warning status beside both desktop and mobile package labels", async () => {
    const html = await readOutput("validation/index.html");
    // `@codenhub/app-shell`'s shared status badge (also used by apps/www and
    // apps/demo) shows a visible text label alongside the icon.
    const chromeLabels = html.match(/class="package-navigation-title"[^>]*>.*?ValidationKit.*?Experimental.*?<\/div>/g);

    expect(chromeLabels).toHaveLength(2);
    expect(html).toContain('<i aria-hidden="true" class="ic-lucide-flask-conical status-badge-icon"></i>Experimental');
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

  it("wraps long headings and prose URLs without reducing table min-content widths", async () => {
    const css = await readFile(new URL("../styles/global.css", import.meta.url), "utf8");
    const articleRule = css.match(/\.markdown-content\s*\{([^}]*)\}/)?.[1];

    expect(articleRule).toMatch(/overflow-wrap:\s*break-word/);
    expect(css).toMatch(/\.markdown-content :is\(h1, h2, h3, h4, h5, h6\)\s*\{[^}]*overflow-wrap:\s*anywhere/s);
    expect(css).toMatch(/\.markdown-content table code\s*\{[^}]*overflow-wrap:\s*break-word/s);
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

  it("builds the not-found page the deployment is configured to serve", async () => {
    const html = await readOutput("404.html");
    const config = await readFile(new URL("../../wrangler.jsonc", import.meta.url), "utf8");

    // `not_found_handling` names a file rather than pointing at one, so nothing
    // fails at deploy time if the page stops being built.
    expect(html).toContain("Page not found");
    expect(config).toContain('"not_found_handling": "404-page"');
    expect(config).toContain('"directory": "./dist"');
  });

  it("points robots at the sitemap for the canonical origin", async () => {
    const robots = await readOutput("robots.txt");

    expect(robots).toBe("User-agent: *\nAllow: /\n\nSitemap: https://docs.codenhub.dev/sitemap.xml\n");
  });

  it("lists every published page in the sitemap, including a curated changelog's overview", async () => {
    const sitemap = await readOutput("sitemap.xml");

    // The root redirects to codenhub.dev/packages/, so it is not a page here.
    expect(sitemap).not.toContain("<loc>https://docs.codenhub.dev/</loc>");
    expect(sitemap).toContain("<loc>https://docs.codenhub.dev/error/</loc>");
    expect(sitemap).toContain("<loc>https://docs.codenhub.dev/icons/changelog/0.2.0/</loc>");
    expect(sitemap).toContain("<loc>https://docs.codenhub.dev/icons/changelog/</loc>");
  });

  it("renders a curated changelog index as an overview with each version's date and description", async () => {
    const html = await readOutput("icons/changelog/index.html");
    // Released versions keep their dates, and a later release only adds a line
    // above these, so this block stays contiguous and in curated order.
    const released = [
      ["0.3.0", "2026-10-26", "October 26, 2026"],
      ["0.2.1", "2026-09-14", "September 14, 2026"],
      ["0.2.0", "2026-09-02", "September 2, 2026"],
    ];
    const entry = ([version, isoDate, shownDate]: string[]): string =>
      `<li><a href="/icons/changelog/${version}/">${version.replaceAll(".", "\\.")}</a> ` +
      `<span class="curated-entry-date">Released on <time datetime="${isoDate}">${shownDate}</time></span>` +
      `<p class="curated-entry-description">[^<]+</p></li>\\s*`;

    expect(html).toMatch(new RegExp(released.map(entry).join("").replaceAll("/", "\\/")));
  });

  it("redirects the root to the package list on codenhub.dev", async () => {
    const redirects = await readOutput("_redirects");

    expect(redirects.trim()).toBe("/ https://codenhub.dev/packages/ 301");
  });

  it("lets other origins read the search index", async () => {
    const headers = await readOutput("_headers");

    expect(headers).toMatch(/^\/search-index\.json\n[ \t]+Access-Control-Allow-Origin: \*$/m);
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
    // A curated overview only repeats its versions' own entries, so it is left out.
    expect(entries.some((entry) => entry.route === "/icons/changelog/")).toBe(false);
    expect(entries.some((entry) => entry.route === "/icons/changelog/0.2.0/")).toBe(true);
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
