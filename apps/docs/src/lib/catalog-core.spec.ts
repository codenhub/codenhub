import { describe, expect, it } from "vitest";

import { buildPackageDefinitions, buildPublicPackageSummaries, parsePackageMetadata } from "./catalog-core";
import { rewritePackageMarkdownLinks } from "./markdown-links";

function createManifest(slug?: string) {
  return {
    name: "@codenhub/example",
    description: "Example package.",
    codenhub: {
      docs: {
        label: "Example",
        status: "experimental",
        ...(slug === undefined ? {} : { slug }),
      },
    },
  };
}

describe("package documentation catalog", () => {
  it("includes public packages without documentation", () => {
    const manifests = {
      "../../packages/documented/package.json": { ...createManifest(), private: false },
      "../../packages/undocumented/package.json": {
        name: "@codenhub/undocumented",
        description: "Undocumented package.",
        private: false,
      },
    };
    const definitions = buildPackageDefinitions(manifests, ["../../packages/documented/docs/index.md"]);

    expect(buildPublicPackageSummaries(manifests, definitions)).toContainEqual({
      description: "Undocumented package.",
      documentationRoute: undefined,
      label: "@codenhub/undocumented",
      name: "@codenhub/undocumented",
      status: undefined,
    });
  });

  it("excludes private workspaces from public package summaries", () => {
    const manifests = {
      "../../packages/public/package.json": {
        name: "@codenhub/public",
        private: false,
      },
      "../../packages/private/package.json": {
        name: "@codenhub/private",
        private: true,
      },
    };

    expect(buildPublicPackageSummaries(manifests, [])).toHaveLength(1);
  });

  it("adds documentation routes to documented public packages", () => {
    const manifests = {
      "../../packages/example/package.json": { ...createManifest("custom-slug"), private: false },
    };
    const definitions = buildPackageDefinitions(manifests, ["../../packages/example/docs/index.md"]);

    expect(buildPublicPackageSummaries(manifests, definitions)[0]?.documentationRoute).toBe("/custom-slug/");
  });

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

  it("uses package slugs to deterministically order duplicate labels", () => {
    const manifests = {
      "../../packages/beta/package.json": {
        ...createManifest("beta"),
        name: "@codenhub/beta",
      },
      "../../packages/alpha/package.json": {
        ...createManifest("alpha"),
        name: "@codenhub/alpha",
      },
    };

    expect(
      buildPackageDefinitions(manifests, [
        "../../packages/beta/docs/index.md",
        "../../packages/alpha/docs/index.md",
      ]).map(({ slug }) => slug),
    ).toEqual(["alpha", "beta"]);
  });

  it("uses package names to deterministically order duplicate summary labels", () => {
    const manifests = {
      "../../packages/beta/package.json": {
        ...createManifest("beta"),
        name: "@codenhub/beta",
        private: false,
      },
      "../../packages/alpha/package.json": {
        ...createManifest("alpha"),
        name: "@codenhub/alpha",
        private: false,
      },
    };
    const definitions = buildPackageDefinitions(manifests, [
      "../../packages/beta/docs/index.md",
      "../../packages/alpha/docs/index.md",
    ]);

    expect(buildPublicPackageSummaries(manifests, definitions).map(({ name }) => name)).toEqual([
      "@codenhub/alpha",
      "@codenhub/beta",
    ]);
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

  it("rejects documentation metadata without a label", () => {
    expect(() =>
      parsePackageMetadata(
        {
          name: "@codenhub/example",
          codenhub: { docs: { status: "experimental" } },
        },
        "package.json",
      ),
    ).toThrow("Invalid codenhub.docs.label");
  });

  it("uses the package description when documentation metadata omits it", () => {
    expect(parsePackageMetadata(createManifest(), "package.json")?.description).toBe("Example package.");
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
