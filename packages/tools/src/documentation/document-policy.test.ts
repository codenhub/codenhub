import { describe, expect, it } from "vitest";

import {
  assertSingleH1,
  comparePublicDocumentPaths,
  comparePublicDocuments,
  parsePublicDocumentFrontmatter,
} from "./document-policy.ts";

describe("public document policy", () => {
  it("accepts a required title and optional description", () => {
    expect(
      parsePublicDocumentFrontmatter(
        {
          description: "Public API reference.",
          title: "API",
        },
        "docs/api.md",
      ),
    ).toEqual({ description: "Public API reference.", title: "API" });
  });

  it("rejects frontmatter without a title", () => {
    expect(() => parsePublicDocumentFrontmatter({}, "docs/api.md")).toThrow("Invalid title frontmatter");
  });

  it("rejects blank titles", () => {
    expect(() => parsePublicDocumentFrontmatter({ title: " " }, "docs/api.md")).toThrow("Invalid title frontmatter");
  });

  it("rejects blank descriptions", () => {
    expect(() => parsePublicDocumentFrontmatter({ description: "", title: "API" }, "docs/api.md")).toThrow(
      "Invalid description frontmatter",
    );
  });

  it("rejects arbitrary frontmatter fields", () => {
    expect(() => parsePublicDocumentFrontmatter({ status: "APPROVED", title: "API" }, "docs/api.md")).toThrow(
      "Unknown frontmatter field",
    );
  });

  it("accepts a page order as a number or a numeric string", () => {
    expect(parsePublicDocumentFrontmatter({ order: 2, title: "API" }, "docs/api.md").order).toBe(2);
    expect(parsePublicDocumentFrontmatter({ order: "0", title: "API" }, "docs/api.md").order).toBe(0);
  });

  it("rejects a page order that is negative or fractional", () => {
    expect(() => parsePublicDocumentFrontmatter({ order: -1, title: "API" }, "docs/api.md")).toThrow(
      "Invalid order frontmatter",
    );
    expect(() => parsePublicDocumentFrontmatter({ order: "1.5", title: "API" }, "docs/api.md")).toThrow(
      "Invalid order frontmatter",
    );
  });

  it("rejects a page order on the package index, which is always first", () => {
    expect(() => parsePublicDocumentFrontmatter({ order: 1, title: "Overview" }, "docs/index.md")).toThrow(
      "the package index is always first",
    );
  });

  it("accepts a group label on a folder index page", () => {
    expect(parsePublicDocumentFrontmatter({ group: "Guides", title: "Overview" }, "docs/guides/index.md").group).toBe(
      "Guides",
    );
  });

  it("rejects a group label anywhere but a folder index page", () => {
    expect(() => parsePublicDocumentFrontmatter({ group: "Guides", title: "Overview" }, "docs/index.md")).toThrow(
      "only a folder index page",
    );
    expect(() => parsePublicDocumentFrontmatter({ group: "Guides", title: "Setup" }, "docs/guides/setup.md")).toThrow(
      "only a folder index page",
    );
  });

  it("reads order and group from a bundler-relative source path", () => {
    const parsed = parsePublicDocumentFrontmatter(
      { group: "Guides", title: "Overview" },
      "../../packages/x/docs/guides/index.md",
    );

    expect(parsed.group).toBe("Guides");
  });

  it("accepts a curated flag as a boolean or a string on a folder index page", () => {
    expect(
      parsePublicDocumentFrontmatter({ curated: true, title: "Changelog" }, "docs/changelog/index.md").curated,
    ).toBe(true);
    expect(
      parsePublicDocumentFrontmatter({ curated: "false", title: "Changelog" }, "docs/changelog/index.md").curated,
    ).toBe(false);
  });

  it("rejects a curated value that is not a boolean", () => {
    expect(() =>
      parsePublicDocumentFrontmatter({ curated: "yes", title: "Changelog" }, "docs/changelog/index.md"),
    ).toThrow("Invalid curated frontmatter");
  });

  it("rejects a curated flag anywhere but a folder index page", () => {
    expect(() => parsePublicDocumentFrontmatter({ curated: true, title: "Overview" }, "docs/index.md")).toThrow(
      "only a folder index page",
    );
    expect(() => parsePublicDocumentFrontmatter({ curated: true, title: "1.2.0" }, "docs/changelog/1.2.0.md")).toThrow(
      "only a folder index page",
    );
  });

  it("rejects documents without an H1", () => {
    expect(() => assertSingleH1([{ depth: 2 }], "docs/api.md")).toThrow("exactly one H1");
  });

  it("rejects documents with multiple H1 headings", () => {
    expect(() => assertSingleH1([{ depth: 1 }, { depth: 1 }], "docs/api.md")).toThrow("exactly one H1");
  });

  it("accepts exactly one H1 independently from the frontmatter title", () => {
    expect(() => assertSingleH1([{ depth: 1, text: "Long authored heading" }], "docs/api.md")).not.toThrow();
  });

  it("sorts the package index before every other page", () => {
    const paths = ["reference.md", "guides/index.md", "index.md"];

    expect(paths.sort(comparePublicDocumentPaths)).toEqual(["index.md", "guides/index.md", "reference.md"]);
  });

  it("orders documents by frontmatter order, then path, with the index always first", () => {
    const documents = [
      { order: 5, relativePath: "reference.md" },
      { relativePath: "concepts.md" },
      { order: 1, relativePath: "guides.md" },
      { relativePath: "index.md" },
      { relativePath: "about.md" },
    ];

    expect(documents.sort(comparePublicDocuments).map((document) => document.relativePath)).toEqual([
      "index.md",
      "guides.md",
      "reference.md",
      "about.md",
      "concepts.md",
    ]);
  });
});
