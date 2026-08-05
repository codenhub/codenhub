import { describe, expect, it } from "vitest";

// @ts-expect-error Package scripts are JavaScript and intentionally unpublished.
import { validateMarkdownLinks } from "../scripts/validate-package.mjs";

const validate = (markdownPath: string, markdown: string, files: Record<string, string>): void => {
  const packedPaths = new Set(Object.keys(files));
  validateMarkdownLinks({
    markdownPath,
    markdown,
    packedPaths,
    readMarkdown: (targetPath: string) => files[targetPath],
  });
};

describe("package Markdown validation", () => {
  it("should reject a missing same-document fragment", () => {
    expect(() =>
      validate("docs/index.md", "# Overview\n\n[Missing](#missing)", { "docs/index.md": "# Overview" }),
    ).toThrow("missing fragment");
  });

  it("should reject public documentation links into package internals", () => {
    expect(() =>
      validate("docs/index.md", "[Runtime](../dist/index.js)", {
        "docs/index.md": "# Overview",
        "dist/index.js": "export {};",
      }),
    ).toThrow("outside public package content");
  });

  it("should reject malformed external URLs", () => {
    expect(() =>
      validate("README.md", "[Invalid](https://[)", {
        "README.md": "# Package",
      }),
    ).toThrow("invalid external URL");
  });
});
