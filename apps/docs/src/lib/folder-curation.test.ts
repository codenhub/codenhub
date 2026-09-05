import { describe, expect, it } from "vitest";

import { applyFolderCuration, type CuratableDocument } from "./folder-curation";

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

  it("keeps only the siblings a curated index links to, in link order", () => {
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

  it("only publishes the index page when a curated index links no siblings", () => {
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
