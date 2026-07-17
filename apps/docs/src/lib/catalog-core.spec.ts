import { describe, expect, it } from "vitest";

import { buildPackageDefinitions, parsePackageMetadata } from "./catalog-core";
import { rewritePackageMarkdownLinks } from "./markdown-links";

function createManifest(slug?: string) {
  return {
    name: "@codenhub/example",
    description: "Example package.",
    codenhub: {
      docs: {
        status: "experimental",
        ...(slug === undefined ? {} : { slug }),
      },
    },
  };
}

describe("package documentation catalog", () => {
  it("excludes internal documents and derives index routes", () => {
    const packages = buildPackageDefinitions({ "../../packages/example/package.json": createManifest() }, [
      "../../packages/example/docs/index.md",
      "../../packages/example/docs/guides/index.md",
      "../../packages/example/docs/internal/roadmap.md",
    ]);

    expect(packages[0]?.documents).toEqual([
      {
        relativePath: "index.md",
        routePath: "",
        sourcePath: "../../packages/example/docs/index.md",
      },
      {
        relativePath: "guides/index.md",
        routePath: "guides",
        sourcePath: "../../packages/example/docs/guides/index.md",
      },
    ]);
  });

  it("rejects duplicate package slugs", () => {
    expect(() =>
      buildPackageDefinitions(
        {
          "../../packages/first/package.json": createManifest("shared"),
          "../../packages/second/package.json": createManifest("shared"),
        },
        ["../../packages/first/docs/index.md", "../../packages/second/docs/index.md"],
      ),
    ).toThrow('Duplicate documentation slug "shared"');
  });

  it("rejects packages without an index", () => {
    expect(() =>
      buildPackageDefinitions({ "../../packages/example/package.json": createManifest() }, [
        "../../packages/example/docs/reference.md",
      ]),
    ).toThrow("Missing docs/index.md");
  });

  it("rejects invalid metadata", () => {
    expect(() =>
      parsePackageMetadata(
        {
          name: "@codenhub/example",
          codenhub: { docs: { status: "stable" } },
        },
        "package.json",
      ),
    ).toThrow("Invalid codenhub.docs.status");
  });

  it("rewrites package-relative Markdown links", () => {
    const html =
      '<p><a href="../reference.md#errors">Reference</a> <a href="https://example.com/file.md">External</a></p>';

    expect(
      rewritePackageMarkdownLinks(html, {
        packageSlug: "example",
        sourceRelativePath: "guides/setup.md",
      }),
    ).toBe(
      '<p><a href="/example/reference/#errors">Reference</a> <a href="https://example.com/file.md">External</a></p>',
    );
  });
});
