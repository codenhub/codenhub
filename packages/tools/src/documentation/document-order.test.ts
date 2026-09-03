import { describe, expect, it } from "vitest";

import { orderDocumentSections, titleCaseSegment } from "./document-order.ts";

interface Doc {
  relativePath: string;
  order?: number;
  group?: string;
}

function sections(documents: Doc[]): { label: string; segment: string; paths: string[] }[] {
  return orderDocumentSections(documents).map((section) => ({
    label: section.label,
    paths: section.documents.map((document) => document.relativePath),
    segment: section.segment,
  }));
}

describe("titleCaseSegment", () => {
  it("title-cases kebab-case and snake_case names", () => {
    expect(titleCaseSegment("getting-started")).toBe("Getting Started");
    expect(titleCaseSegment("delivery_methods")).toBe("Delivery Methods");
  });
});

describe("orderDocumentSections", () => {
  it("keeps the package index first and root pages before folder sections by default", () => {
    expect(
      sections([
        { relativePath: "concepts.md" },
        { relativePath: "guide/index.md" },
        { relativePath: "guide/a.md" },
        { relativePath: "index.md" },
        { relativePath: "reference.md" },
      ]).map((section) => section.segment || section.paths[0]),
    ).toEqual(["index.md", "concepts.md", "reference.md", "guide"]);
  });

  it("orders root pages and folder sections together by frontmatter order", () => {
    expect(
      sections([
        { relativePath: "index.md" },
        { order: 3, relativePath: "reference.md" },
        { order: 1, relativePath: "guide/index.md" },
        { relativePath: "guide/a.md" },
        { order: 2, relativePath: "concepts.md" },
      ]).map((section) => section.segment || section.paths[0]),
    ).toEqual(["index.md", "guide", "concepts.md", "reference.md"]);
  });

  it("labels a folder from its index group, then the title-cased folder name", () => {
    const [, withGroup, withoutGroup] = sections([
      { relativePath: "index.md" },
      { group: "Framework guides", relativePath: "frameworks/index.md" },
      { relativePath: "how-to/index.md" },
    ]);

    expect(withGroup).toMatchObject({ segment: "frameworks", label: "Framework guides" });
    expect(withoutGroup).toMatchObject({ segment: "how-to", label: "How To" });
  });

  it("puts a folder index first, then its pages by order and path", () => {
    const [, guide] = sections([
      { relativePath: "index.md" },
      { relativePath: "guide/index.md" },
      { relativePath: "guide/alpha.md" },
      { order: 1, relativePath: "guide/zeta.md" },
      { order: 2, relativePath: "guide/mid.md" },
    ]);

    expect(guide.paths).toEqual(["guide/index.md", "guide/zeta.md", "guide/mid.md", "guide/alpha.md"]);
  });

  it("handles a folder with no index page", () => {
    const [section] = orderDocumentSections([{ relativePath: "recipes/first.md" }]);

    expect(section).toMatchObject({ segment: "recipes", label: "Recipes" });
    expect(section.documents.map((document) => document.relativePath)).toEqual(["recipes/first.md"]);
  });
});
