import { describe, expect, it } from "vitest";

import { annotateCuratedLinks, applyFolderCuration, type CuratableDocument } from "./folder-curation";

function document(relativePath: string, overrides: Partial<CuratableDocument> = {}): CuratableDocument {
  return { rawHtml: "", relativePath, ...overrides };
}

function paths(documents: CuratableDocument[]): string[] {
  return documents.map((doc) => doc.relativePath);
}

describe("applyFolderCuration", () => {
  it("leaves a folder without a curated index untouched", () => {
    const documents = [
      document("index.md"),
      document("guides/index.md"),
      document("guides/a.md"),
      document("guides/b.md"),
    ];

    expect(paths(applyFolderCuration(documents))).toEqual(paths(documents));
  });

  it("leaves a folder with no index page untouched", () => {
    const documents = [document("index.md"), document("recipes/first.md"), document("recipes/second.md")];

    expect(paths(applyFolderCuration(documents))).toEqual(paths(documents));
  });

  it("keeps the curated index and only the siblings it links, in link order", () => {
    const documents = [
      document("index.md"),
      document("changelog/index.md", {
        curated: true,
        rawHtml: `<ul><li><a href="1.1.0.md">1.1.0</a></li><li><a href="1.0.0.md">1.0.0</a></li></ul>`,
      }),
      document("changelog/1.1.0.md"),
      document("changelog/1.0.0.md"),
      document("changelog/0.9.0.md"),
    ];

    const result = applyFolderCuration(documents);

    expect(paths(result)).toEqual(["index.md", "changelog/index.md", "changelog/1.1.0.md", "changelog/1.0.0.md"]);
  });

  it("assigns synthetic order matching link position, ignoring any prior order", () => {
    const documents = [
      document("changelog/index.md", {
        curated: true,
        rawHtml: `<a href="1.1.0.md">1.1.0</a> <a href="1.0.0.md">1.0.0</a>`,
      }),
      document("changelog/1.1.0.md", { order: 9 }),
      document("changelog/1.0.0.md"),
    ];

    const result = applyFolderCuration(documents);

    expect(result.find((doc) => doc.relativePath === "changelog/1.1.0.md")?.order).toBe(0);
    expect(result.find((doc) => doc.relativePath === "changelog/1.0.0.md")?.order).toBe(1);
  });

  it("dedupes a sibling linked more than once, keeping its first position", () => {
    const documents = [
      document("changelog/index.md", {
        curated: true,
        rawHtml: `<a href="1.0.0.md">1.0.0</a> <a href="1.0.0.md">again</a> <a href="0.9.0.md">0.9.0</a>`,
      }),
      document("changelog/1.0.0.md"),
      document("changelog/0.9.0.md"),
    ];

    const result = applyFolderCuration(documents);

    expect(paths(result)).toEqual(["changelog/index.md", "changelog/1.0.0.md", "changelog/0.9.0.md"]);
  });

  it("ignores links that don't match a sibling filename", () => {
    const documents = [
      document("changelog/index.md", {
        curated: true,
        rawHtml: `<a href="https://example.com">external</a> <a href="../guides/setup.md">other folder</a> <a href="missing.md">missing</a> <a href="1.0.0.md">1.0.0</a>`,
      }),
      document("changelog/1.0.0.md"),
    ];

    const result = applyFolderCuration(documents);

    expect(paths(result)).toEqual(["changelog/index.md", "changelog/1.0.0.md"]);
  });

  it("publishes only the index of a curated folder whose index links no siblings", () => {
    const documents = [
      document("changelog/index.md", { curated: true, rawHtml: "<p>Nothing yet.</p>" }),
      document("changelog/1.0.0.md"),
    ];

    expect(paths(applyFolderCuration(documents))).toEqual(["changelog/index.md"]);
  });

  it("matches a sibling link that carries a fragment or query string", () => {
    const documents = [
      document("changelog/index.md", {
        curated: true,
        rawHtml: `<a href="1.0.0.md#fixed">1.0.0</a> <a href="0.9.0.md?utm=x">0.9.0</a>`,
      }),
      document("changelog/1.0.0.md"),
      document("changelog/0.9.0.md"),
    ];

    const result = applyFolderCuration(documents);

    expect(paths(result)).toEqual(["changelog/index.md", "changelog/1.0.0.md", "changelog/0.9.0.md"]);
  });

  it("ignores an image src that happens to match a sibling filename", () => {
    const documents = [
      document("changelog/index.md", {
        curated: true,
        rawHtml: `<img src="1.0.0.md?cache=1"> <a href="0.9.0.md">0.9.0</a>`,
      }),
      document("changelog/1.0.0.md"),
      document("changelog/0.9.0.md"),
    ];

    const result = applyFolderCuration(documents);

    expect(paths(result)).toEqual(["changelog/index.md", "changelog/0.9.0.md"]);
  });

  it("curates a nested folder by its own immediate index, not an ancestor's", () => {
    const documents = [
      document("guides/index.md"),
      document("guides/setup.md"),
      document("guides/advanced/index.md", {
        curated: true,
        rawHtml: `<a href="deep-dive.md">Deep dive</a>`,
      }),
      document("guides/advanced/deep-dive.md"),
      document("guides/advanced/unlisted.md"),
    ];

    const result = applyFolderCuration(documents);

    expect(paths(result)).toEqual([
      "guides/index.md",
      "guides/setup.md",
      "guides/advanced/index.md",
      "guides/advanced/deep-dive.md",
    ]);
  });
});

describe("annotateCuratedLinks", () => {
  const entries = [
    { date: "2026-10-01", description: "Adds a strict mode.", route: "/pkg/changelog/1.1.0/" },
    { date: "2026-09-01", description: "First release.", route: "/pkg/changelog/1.0.0/" },
  ];

  it("adds the date and description after each linked entry", () => {
    const html = `<h1>Changelog</h1><ul><li><a href="/pkg/changelog/1.1.0/">1.1.0</a></li><li><a href="/pkg/changelog/1.0.0/">1.0.0</a></li></ul>`;

    expect(annotateCuratedLinks(html, entries)).toBe(
      `<h1>Changelog</h1><ul>` +
        `<li><a href="/pkg/changelog/1.1.0/">1.1.0</a> <span class="curated-entry-date">Released on <time datetime="2026-10-01">October 1, 2026</time></span><p class="curated-entry-description">Adds a strict mode.</p></li>` +
        `<li><a href="/pkg/changelog/1.0.0/">1.0.0</a> <span class="curated-entry-date">Released on <time datetime="2026-09-01">September 1, 2026</time></span><p class="curated-entry-description">First release.</p></li>` +
        `</ul>`,
    );
  });

  it("omits whichever of the date and description an entry lacks", () => {
    const html = `<a href="/pkg/changelog/1.0.0/">1.0.0</a> <a href="/pkg/changelog/0.9.0/">0.9.0</a>`;

    expect(
      annotateCuratedLinks(html, [
        { route: "/pkg/changelog/1.0.0/", description: "Only a summary." },
        { route: "/pkg/changelog/0.9.0/", date: "2026-01-01" },
      ]),
    ).toBe(
      `<a href="/pkg/changelog/1.0.0/">1.0.0</a><p class="curated-entry-description">Only a summary.</p> ` +
        `<a href="/pkg/changelog/0.9.0/">0.9.0</a> <span class="curated-entry-date">Released on <time datetime="2026-01-01">January 1, 2026</time></span>`,
    );
  });

  it("annotates only the first link to an entry and ignores links to anything else", () => {
    const html = `<a href="/pkg/changelog/1.0.0/#fixed">1.0.0</a> <a href="/pkg/changelog/1.0.0/">again</a> <a href="https://example.com">x</a>`;

    expect(annotateCuratedLinks(html, [entries[1]!])).toBe(
      `<a href="/pkg/changelog/1.0.0/#fixed">1.0.0</a> <span class="curated-entry-date">Released on <time datetime="2026-09-01">September 1, 2026</time></span><p class="curated-entry-description">First release.</p> ` +
        `<a href="/pkg/changelog/1.0.0/">again</a> <a href="https://example.com">x</a>`,
    );
  });

  it("escapes the description", () => {
    const html = `<a href="/pkg/changelog/1.0.0/">1.0.0</a>`;

    expect(annotateCuratedLinks(html, [{ description: "Fixes <T> & more.", route: "/pkg/changelog/1.0.0/" }])).toBe(
      `<a href="/pkg/changelog/1.0.0/">1.0.0</a><p class="curated-entry-description">Fixes &lt;T&gt; &amp; more.</p>`,
    );
  });
});
