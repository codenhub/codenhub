import { describe, expect, it } from "vitest";

import { assertSingleH1, comparePublicDocumentPaths, parsePublicDocumentFrontmatter } from "./public-document-policy";

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

  it("rejects page order frontmatter", () => {
    expect(() => parsePublicDocumentFrontmatter({ order: 1, title: "API" }, "docs/api.md")).toThrow(
      "Unknown frontmatter field",
    );
  });

  it("rejects arbitrary frontmatter fields", () => {
    expect(() => parsePublicDocumentFrontmatter({ status: "APPROVED", title: "API" }, "docs/api.md")).toThrow(
      "Unknown frontmatter field",
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
});
